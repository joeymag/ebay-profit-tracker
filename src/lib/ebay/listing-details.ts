import { fetchBrowseGroupMembersByListingId } from "@/lib/ebay/browse-client";
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
  /** Set when extra variation rows were merged from Browse/Inventory APIs. */
  variationsWarning: string | null;
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
  const specificsXml =
    extractXmlTag(variationXml, "VariationSpecifics") ?? variationXml;
  const lists = extractXmlBlocks(specificsXml, "NameValueList");
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

function normalizeAspectKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Item specifics that appear on Browse rows but are not eBay variation axes. */
const NON_VARIATION_ASPECT_NAMES = new Set([
  "brand",
  "mpn",
  "upc",
  "ean",
  "isbn",
  "epid",
  "type",
  "model",
]);

function parseVariationSpecificsSetNames(itemXml: string): string[] {
  const variationsXml = extractXmlTag(itemXml, "Variations");
  if (!variationsXml) {
    return [];
  }

  const setXml = extractXmlTag(variationsXml, "VariationSpecificsSet");
  if (!setXml) {
    return [];
  }

  const names: string[] = [];
  for (const list of extractXmlBlocks(setXml, "NameValueList")) {
    const name = extractXmlTag(list, "Name")?.trim();
    if (name && !names.some((existing) => normalizeAspectKey(existing) === normalizeAspectKey(name))) {
      names.push(name);
    }
  }

  return names;
}

function variationAxisNamesFromGetItem(
  itemXml: string,
  variations: EbayListingVariation[],
): string[] {
  const fromSet = parseVariationSpecificsSetNames(itemXml);
  if (fromSet.length) {
    return fromSet;
  }

  const names: string[] = [];
  for (const variation of variations) {
    for (const pair of variation.specificsPairs) {
      const name = pair.name.trim();
      if (
        !name ||
        names.some(
          (existing) =>
            normalizeAspectKey(existing) === normalizeAspectKey(name),
        )
      ) {
        continue;
      }
      names.push(name);
    }
  }

  return names;
}

function filterToVariationAxes(
  pairs: EbayVariationSpecific[],
  axisNames: string[],
): EbayVariationSpecific[] {
  if (!axisNames.length) {
    return pairs.filter(
      (pair) =>
        !NON_VARIATION_ASPECT_NAMES.has(normalizeAspectKey(pair.name)),
    );
  }

  const axisKeys = new Set(axisNames.map(normalizeAspectKey));
  return pairs.filter((pair) => axisKeys.has(normalizeAspectKey(pair.name)));
}

function orderSpecificsByAxes(
  pairs: EbayVariationSpecific[],
  axisNames: string[],
): EbayVariationSpecific[] {
  if (!axisNames.length) {
    return pairs;
  }

  const ordered: EbayVariationSpecific[] = [];
  for (const axis of axisNames) {
    const match = pairs.find(
      (pair) => normalizeAspectKey(pair.name) === normalizeAspectKey(axis),
    );
    if (match) {
      ordered.push({ name: axis, value: match.value });
    }
  }

  for (const pair of pairs) {
    if (
      !ordered.some(
        (existing) =>
          normalizeAspectKey(existing.name) === normalizeAspectKey(pair.name),
      )
    ) {
      ordered.push(pair);
    }
  }

  return ordered;
}

function variationMatchesAspects(
  variation: EbayListingVariation,
  aspects: EbayVariationSpecific[],
): boolean {
  if (!aspects.length) {
    return false;
  }

  return aspects.every((aspect) =>
    variation.specificsPairs.some(
      (pair) =>
        normalizeAspectKey(pair.name) === normalizeAspectKey(aspect.name) &&
        normalizeAspectKey(pair.value) === normalizeAspectKey(aspect.value),
    ),
  );
}

function enrichSellerVariationWithBrowse(
  sellerRow: EbayListingVariation,
  browseRow: EbayListingVariation,
): EbayListingVariation {
  return {
    ...sellerRow,
    sku: sellerRow.sku ?? browseRow.sku,
    price: sellerRow.price ?? browseRow.price,
    currency: sellerRow.currency ?? browseRow.currency,
    quantity: sellerRow.quantity ?? browseRow.quantity,
    quantitySold: sellerRow.quantitySold ?? browseRow.quantitySold,
    quantityAvailable:
      sellerRow.quantityAvailable ?? browseRow.quantityAvailable,
  };
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

const VARIATIONS_PER_PAGE = 100;
const MAX_VARIATION_PAGES = 20;

async function fetchGetItemXml(
  listingId: string,
  variationPage?: number,
): Promise<string> {
  const paginationXml =
    variationPage != null
      ? `
  <VariationPageNumber>${variationPage}</VariationPageNumber>
  <VariationsPerPage>${VARIATIONS_PER_PAGE}</VariationsPerPage>`
      : "";

  return ebayTradingCall(
    "GetItem",
    `
  <ErrorLanguage>en_GB</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>${escapeXml(listingId)}</ItemID>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
  <IncludeVariations>true</IncludeVariations>
  <DetailLevel>ReturnAll</DetailLevel>${paginationXml}`,
  );
}

function parseVariationsFromItemXml(itemXml: string): EbayListingVariation[] {
  const variationsXml = extractXmlTag(itemXml, "Variations");
  const variationBlocks = variationsXml
    ? extractXmlBlocks(variationsXml, "Variation")
    : [];
  return variationBlocks.map(parseVariation);
}

function parseVariationPagination(
  variationsXml: string | null,
  itemXml: string,
): { pageNumber: number | null; totalPages: number | null } {
  return {
    pageNumber: parseIntSafe(
      extractXmlTag(variationsXml ?? "", "PageNumber") ??
        extractXmlTag(itemXml, "PageNumber"),
    ),
    totalPages: parseIntSafe(
      extractXmlTag(variationsXml ?? "", "TotalNumberOfPages") ??
        extractXmlTag(itemXml, "TotalNumberOfPages"),
    ),
  };
}

function variationIdentity(variation: EbayListingVariation): string {
  const sku = variation.sku?.trim();
  if (sku) {
    return `sku:${sku.toLowerCase()}`;
  }

  if (variation.specificsPairs.length) {
    return `spec:${variation.specificsPairs
      .map((pair) => `${pair.name}=${pair.value}`)
      .join("|")
      .toLowerCase()}`;
  }

  return `label:${variation.specifics.toLowerCase()}`;
}

function mergeVariationLists(
  target: EbayListingVariation[],
  incoming: EbayListingVariation[],
): EbayListingVariation[] {
  const seen = new Set(target.map(variationIdentity));
  for (const variation of incoming) {
    const key = variationIdentity(variation);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    target.push(variation);
  }
  return target;
}

async function fetchAllGetItemVariations(
  listingId: string,
  itemXml: string,
): Promise<EbayListingVariation[]> {
  const variationsXml = extractXmlTag(itemXml, "Variations");
  let variations = parseVariationsFromItemXml(itemXml);
  const { totalPages } = parseVariationPagination(variationsXml, itemXml);

  const needsPagination =
    (totalPages != null && totalPages > 1) ||
    variations.length >= VARIATIONS_PER_PAGE;

  if (!needsPagination) {
    return variations;
  }

  let paginatedVariations: EbayListingVariation[] = [];
  const lastPage = totalPages ?? MAX_VARIATION_PAGES;
  for (let page = 1; page <= lastPage; page += 1) {
    const xml = await fetchGetItemXml(listingId, page);
    const pageItemXml = extractXmlTag(xml, "Item");
    if (!pageItemXml) {
      break;
    }

    const pageVariations = parseVariationsFromItemXml(pageItemXml);
    if (!pageVariations.length) {
      break;
    }

    paginatedVariations = mergeVariationLists(
      paginatedVariations,
      pageVariations,
    );

    if (totalPages == null && pageVariations.length < VARIATIONS_PER_PAGE) {
      break;
    }
    if (totalPages != null && page >= totalPages) {
      break;
    }
  }

  if (paginatedVariations.length > variations.length) {
    return paginatedVariations;
  }

  return mergeVariationLists(variations, paginatedVariations);
}

function isWithinBrowseAspectUniverse(
  variation: EbayListingVariation,
  browseMembers: Array<{
    specificsPairs: Array<{ name: string; value: string }>;
  }>,
  axisNames: string[],
): boolean {
  if (!axisNames.length || !variation.specificsPairs.length) {
    return true;
  }

  const allowedValues = new Map<string, Set<string>>();
  for (const member of browseMembers) {
    for (const pair of member.specificsPairs) {
      const key = normalizeAspectKey(pair.name);
      if (
        axisNames.length &&
        !axisNames.some((axis) => normalizeAspectKey(axis) === key)
      ) {
        continue;
      }
      const bucket = allowedValues.get(key) ?? new Set<string>();
      bucket.add(normalizeAspectKey(pair.value));
      allowedValues.set(key, bucket);
    }
  }

  for (const pair of variation.specificsPairs) {
    const key = normalizeAspectKey(pair.name);
    if (
      axisNames.length &&
      !axisNames.some((axis) => normalizeAspectKey(axis) === key)
    ) {
      continue;
    }
    const allowed = allowedValues.get(key);
    if (allowed && !allowed.has(normalizeAspectKey(pair.value))) {
      return false;
    }
  }

  return true;
}

async function reconcileVariationsWithBrowse(input: {
  listingId: string;
  itemXml: string;
  getItemVariations: EbayListingVariation[];
}): Promise<{ variations: EbayListingVariation[]; warning: string | null }> {
  const axisNames = variationAxisNamesFromGetItem(
    input.itemXml,
    input.getItemVariations,
  );

  let getItemVariations = input.getItemVariations.map((variation) => {
    const pairs = orderSpecificsByAxes(
      filterToVariationAxes(variation.specificsPairs, axisNames),
      axisNames,
    );
    return {
      ...variation,
      specificsPairs: pairs.length ? pairs : variation.specificsPairs,
      specifics: pairs.length
        ? formatSpecifics(pairs)
        : variation.specifics,
    };
  });

  try {
    const browseMembers = await fetchBrowseGroupMembersByListingId(
      input.listingId,
    );
    if (!browseMembers?.length || browseMembers.length === 1) {
      return { variations: getItemVariations, warning: null };
    }

    // Prefer seller axes; otherwise keep Browse aspects that look like variation options.
    const browseAxisNames =
      axisNames.length > 0
        ? axisNames
        : [
            ...new Set(
              browseMembers.flatMap((member) =>
                member.specificsPairs
                  .map((pair) => pair.name.trim())
                  .filter(
                    (name) =>
                      name &&
                      !NON_VARIATION_ASPECT_NAMES.has(normalizeAspectKey(name)),
                  ),
              ),
            ),
          ];

    const filteredGetItem = getItemVariations.filter((variation) =>
      isWithinBrowseAspectUniverse(
        variation,
        browseMembers,
        browseAxisNames,
      ),
    );
    if (filteredGetItem.length) {
      getItemVariations = filteredGetItem;
    }

    const browseVariations = browseMembers.map((member) => {
      const pairs = orderSpecificsByAxes(
        filterToVariationAxes(member.specificsPairs, browseAxisNames),
        browseAxisNames,
      );
      const getItemMatch = getItemVariations.find((variation) =>
        variationMatchesAspects(variation, pairs),
      );

      const base: EbayListingVariation = {
        sku: member.sku,
        specifics: formatSpecifics(pairs) || member.sku || "Variation",
        specificsPairs: pairs,
        price: member.price,
        currency: member.currency,
        quantity: member.quantityAvailable,
        quantitySold: null,
        quantityAvailable: member.quantityAvailable,
        unitCost: null,
        postageCost: null,
      };

      return getItemMatch
        ? enrichSellerVariationWithBrowse(getItemMatch, base)
        : base;
    });

    // Prefer seller GetItem rows when they cover the live listing option set.
    if (getItemVariations.length >= browseVariations.length) {
      const reconciled = getItemVariations.map((variation) => {
        const browseMatch = browseVariations.find((candidate) =>
          variationMatchesAspects(variation, candidate.specificsPairs),
        );
        return browseMatch
          ? enrichSellerVariationWithBrowse(variation, browseMatch)
          : variation;
      });

      const removed = input.getItemVariations.length - getItemVariations.length;
      return {
        variations: reconciled,
        warning:
          removed > 0
            ? `Removed ${removed} variation row${removed === 1 ? "" : "s"} not on the live eBay listing.`
            : null,
      };
    }

    return {
      variations: browseVariations,
      warning:
        "Variation list matched to the live eBay listing (size / pack qty / finish).",
    };
  } catch {
    return { variations: getItemVariations, warning: null };
  }
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
  const xml = await fetchGetItemXml(trimmedId);

  const itemXml = extractXmlTag(xml, "Item");
  if (!itemXml) {
    throw new Error(`Listing ${trimmedId} was not returned by eBay.`);
  }

  let variations = await fetchAllGetItemVariations(trimmedId, itemXml);

  const reconciled = await reconcileVariationsWithBrowse({
    listingId: trimmedId,
    itemXml,
    getItemVariations: variations,
  });
  variations = reconciled.variations;

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

  const itemSku = extractXmlTag(itemXml, "SKU")?.trim() || null;

  const isMultiVariationListing = variations.length > 0;

  const displayVariations = isMultiVariationListing
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
    isMultiVariation: isMultiVariationListing,
    variations: variationsWithCosts,
    promoRatePercent: promoRate?.bidPercentage ?? null,
    promoAdStatus: promoRate?.adStatus ?? null,
    promoCampaignName: promoRate?.campaignName ?? null,
    promoWarning: promo.warning,
    variationsWarning: reconciled.warning,
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
