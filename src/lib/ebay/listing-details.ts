import { getEbayConfig } from "@/lib/ebay/config";
import { fetchEbayPromoRatesByListingId } from "@/lib/ebay/promo-rates";
import {
  ebayTradingCall,
  escapeXml,
  extractXmlAttr,
  extractXmlBlocks,
  extractXmlTag,
} from "@/lib/ebay/trading-client";
import { ebayListingUrl } from "@/lib/ebay/traffic-report-types";

export type EbayVariationSpecific = {
  name: string;
  value: string;
};

export type EbayListingVariation = {
  sku: string | null;
  specifics: string;
  specificsPairs: EbayVariationSpecific[];
  price: number | null;
  currency: string | null;
  quantity: number | null;
  quantitySold: number | null;
  quantityAvailable: number | null;
  /** Product unit cost ex-VAT from catalog (for pre-sale profit estimates). */
  unitCost: number | null;
  /** Default postage / label cost for this SKU. */
  postageCost: number | null;
};

export type EbayListingDetails = {
  listingId: string;
  title: string | null;
  sku: string | null;
  status: string | null;
  format: string | null;
  marketplaceId: string;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  quantitySold: number | null;
  quantityAvailable: number | null;
  imageUrl: string | null;
  itemWebUrl: string;
  isMultiVariation: boolean;
  variations: EbayListingVariation[];
  promoRatePercent: number | null;
  promoAdStatus: string | null;
  promoCampaignName: string | null;
  promoWarning: string | null;
  fetchedAt: string;
};

export type EbayVariationEdit = {
  /** Original SKU from eBay (used when identifying single-SKU updates). */
  originalSku: string | null;
  sku: string | null;
  price: number | null;
  specificsPairs: EbayVariationSpecific[];
};

export type ReviseEbayListingInput = {
  listingId: string;
  isMultiVariation: boolean;
  format: string | null;
  currency: string;
  title?: string | null;
  variations: EbayVariationEdit[];
};

export type ReviseEbayListingResult = {
  listingId: string;
  updatedCount: number;
  ack: string | null;
  warnings: string[];
};

function parseAmount(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : null;
}

function parseIntSafe(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const amount = Number.parseInt(value, 10);
  return Number.isFinite(amount) ? amount : null;
}

function parseSpecificsPairs(variationXml: string): EbayVariationSpecific[] {
  const lists = extractXmlBlocks(variationXml, "NameValueList");
  const pairs: EbayVariationSpecific[] = [];

  for (const list of lists) {
    const name = extractXmlTag(list, "Name")?.trim();
    const value = extractXmlTag(list, "Value")?.trim();
    if (name && value) {
      pairs.push({ name, value });
    }
  }

  return pairs;
}

function formatSpecifics(pairs: EbayVariationSpecific[]): string {
  return pairs.map((pair) => `${pair.name}: ${pair.value}`).join(" · ");
}

function parseVariation(variationXml: string): EbayListingVariation {
  const quantity = parseIntSafe(extractXmlTag(variationXml, "Quantity"));
  const quantitySold = parseIntSafe(extractXmlTag(variationXml, "QuantitySold"));
  const quantityAvailable =
    quantity != null && quantitySold != null
      ? Math.max(0, quantity - quantitySold)
      : quantity;

  const price =
    parseAmount(extractXmlTag(variationXml, "StartPrice")) ??
    parseAmount(extractXmlTag(variationXml, "CurrentPrice"));
  const currency =
    extractXmlAttr(variationXml, "StartPrice", "currencyID") ??
    extractXmlAttr(variationXml, "CurrentPrice", "currencyID");
  const specificsPairs = parseSpecificsPairs(variationXml);

  return {
    sku: extractXmlTag(variationXml, "SKU")?.trim() || null,
    specifics: formatSpecifics(specificsPairs) || "Variation",
    specificsPairs,
    price,
    currency,
    quantity,
    quantitySold,
    quantityAvailable,
    unitCost: null,
    postageCost: null,
  };
}

/**
 * Full listing details + variations via Trading API GetItem.
 */
export async function fetchEbayListingDetails(
  listingId: string,
): Promise<EbayListingDetails> {
  const trimmedId = listingId.trim();
  if (!trimmedId) {
    throw new Error("Listing ID is required.");
  }

  const { marketplaceId } = getEbayConfig();
  const xml = await ebayTradingCall(
    "GetItem",
    `
  <ErrorLanguage>en_GB</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>${escapeXml(trimmedId)}</ItemID>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
  <DetailLevel>ReturnAll</DetailLevel>`,
  );

  const itemXml = extractXmlTag(xml, "Item");
  if (!itemXml) {
    throw new Error(`Listing ${trimmedId} was not returned by eBay.`);
  }

  const variationsXml = extractXmlTag(itemXml, "Variations");
  const variationBlocks = variationsXml
    ? extractXmlBlocks(variationsXml, "Variation")
    : [];
  const variations = variationBlocks.map(parseVariation);

  const quantity = parseIntSafe(extractXmlTag(itemXml, "Quantity"));
  const quantitySold = parseIntSafe(extractXmlTag(itemXml, "QuantitySold"));
  const quantityAvailable =
    quantity != null && quantitySold != null
      ? Math.max(0, quantity - quantitySold)
      : parseIntSafe(extractXmlTag(itemXml, "QuantityAvailable")) ?? quantity;

  const price =
    parseAmount(extractXmlTag(itemXml, "CurrentPrice")) ??
    parseAmount(extractXmlTag(itemXml, "BuyItNowPrice")) ??
    parseAmount(extractXmlTag(itemXml, "StartPrice"));
  const currency =
    extractXmlAttr(itemXml, "CurrentPrice", "currencyID") ??
    extractXmlAttr(itemXml, "BuyItNowPrice", "currencyID") ??
    extractXmlAttr(itemXml, "StartPrice", "currencyID");

  const isMultiVariation = variations.length > 0;
  const itemSku = extractXmlTag(itemXml, "SKU")?.trim() || null;

  const displayVariations = isMultiVariation
    ? variations
    : [
        {
          sku: itemSku,
          specifics: "Single listing",
          specificsPairs: [],
          price,
          currency,
          quantity,
          quantitySold,
          quantityAvailable,
          unitCost: null,
          postageCost: null,
        } satisfies EbayListingVariation,
      ];

  const promo = await fetchEbayPromoRatesByListingId({
    listingIds: [trimmedId],
  });
  const promoRate = promo.ratesByListingId[trimmedId];

  let costBySku = new Map<
    string,
    { unitCost: number | null; defaultPostage: number | null }
  >();
  try {
    const { getSkuCostSnapshots } = await import("@/lib/products/listing-costs");
    costBySku = await getSkuCostSnapshots(
      displayVariations.map((variation) => variation.sku),
    );
  } catch {
    // Cost enrichment is best-effort; listing details should still load.
  }

  const variationsWithCosts = displayVariations.map((variation) => {
    const sku = variation.sku?.trim();
    const costs = sku ? costBySku.get(sku) : undefined;
    return {
      ...variation,
      unitCost: costs?.unitCost ?? null,
      postageCost: costs?.defaultPostage ?? null,
    };
  });

  return {
    listingId: extractXmlTag(itemXml, "ItemID") ?? trimmedId,
    title: extractXmlTag(itemXml, "Title"),
    sku: itemSku,
    status: extractXmlTag(itemXml, "ListingStatus"),
    format: extractXmlTag(itemXml, "ListingType"),
    marketplaceId,
    price,
    currency,
    quantity,
    quantitySold,
    quantityAvailable,
    imageUrl:
      extractXmlTag(itemXml, "GalleryURL") ??
      extractXmlTag(itemXml, "PictureURL"),
    itemWebUrl: ebayListingUrl(trimmedId, marketplaceId),
    isMultiVariation,
    variations: variationsWithCosts,
    promoRatePercent: promoRate?.bidPercentage ?? null,
    promoAdStatus: promoRate?.adStatus ?? null,
    promoCampaignName: promoRate?.campaignName ?? null,
    promoWarning: promo.warning,
    fetchedAt: new Date().toISOString(),
  };
}

function variationSpecificsXml(pairs: EbayVariationSpecific[]): string {
  if (!pairs.length) {
    return "";
  }

  const lists = pairs
    .map(
      (pair) => `
        <NameValueList>
          <Name>${escapeXml(pair.name)}</Name>
          <Value>${escapeXml(pair.value)}</Value>
        </NameValueList>`,
    )
    .join("");

  return `
      <VariationSpecifics>
        ${lists}
      </VariationSpecifics>`;
}

function reviseCallName(format: string | null): string {
  const normalized = format?.trim().toLowerCase() ?? "";
  if (
    !normalized ||
    normalized.includes("fixedprice") ||
    normalized.includes("storesfixedprice")
  ) {
    return "ReviseFixedPriceItem";
  }

  return "ReviseItem";
}

/**
 * Push SKU / price edits to eBay via Trading API revise call.
 */
export async function reviseEbayListingSkuAndPrice(
  input: ReviseEbayListingInput,
): Promise<ReviseEbayListingResult> {
  const listingId = input.listingId.trim();
  if (!listingId) {
    throw new Error("Listing ID is required.");
  }

  const title =
    input.title != null && input.title.trim() ? input.title.trim() : null;

  if (!input.variations.length && !title) {
    throw new Error("Provide a title and/or at least one variation update.");
  }

  const currency = (input.currency || "GBP").trim().toUpperCase();
  const callName = reviseCallName(input.format);
  const titleXml = title ? `<Title>${escapeXml(title)}</Title>` : "";

  let itemBody: string;

  if (input.isMultiVariation && input.variations.length) {
    const variationXml = input.variations
      .map((variation) => {
        if (!variation.specificsPairs.length) {
          throw new Error(
            `Variation "${variation.originalSku ?? "unknown"}" is missing option specifics needed to update eBay.`,
          );
        }

        const skuXml =
          variation.sku != null && variation.sku.trim()
            ? `<SKU>${escapeXml(variation.sku.trim())}</SKU>`
            : "";
        const priceXml =
          variation.price != null && Number.isFinite(variation.price)
            ? `<StartPrice currencyID="${escapeXml(currency)}">${variation.price.toFixed(2)}</StartPrice>`
            : "";

        return `
      <Variation>
        ${skuXml}
        ${priceXml}
        ${variationSpecificsXml(variation.specificsPairs)}
      </Variation>`;
      })
      .join("");

    itemBody = `
  <Item>
    <ItemID>${escapeXml(listingId)}</ItemID>
    ${titleXml}
    <Variations>
      ${variationXml}
    </Variations>
  </Item>`;
  } else if (input.variations.length) {
    const variation = input.variations[0]!;
    const skuXml =
      variation.sku != null
        ? `<SKU>${escapeXml(variation.sku.trim())}</SKU>`
        : "";
    const priceXml =
      variation.price != null && Number.isFinite(variation.price)
        ? `<StartPrice currencyID="${escapeXml(currency)}">${variation.price.toFixed(2)}</StartPrice>`
        : "";

    itemBody = `
  <Item>
    <ItemID>${escapeXml(listingId)}</ItemID>
    ${titleXml}
    ${skuXml}
    ${priceXml}
  </Item>`;
  } else {
    itemBody = `
  <Item>
    <ItemID>${escapeXml(listingId)}</ItemID>
    ${titleXml}
  </Item>`;
  }

  const xml = await ebayTradingCall(
    callName,
    `
  <ErrorLanguage>en_GB</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  ${itemBody}`,
  );

  const ack = extractXmlTag(xml, "Ack");
  const warnings = extractXmlBlocks(xml, "Errors")
    .map((block) => {
      const severity = extractXmlTag(block, "SeverityCode")?.toUpperCase();
      if (severity === "ERROR") {
        return null;
      }
      return (
        extractXmlTag(block, "LongMessage") ??
        extractXmlTag(block, "ShortMessage")
      );
    })
    .filter((message): message is string => Boolean(message));

  return {
    listingId,
    updatedCount: input.variations.length + (title ? 1 : 0),
    ack,
    warnings,
  };
}
