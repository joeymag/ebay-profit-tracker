import { getEbayConfig } from "@/lib/ebay/config";
import {
  ebayTradingCall,
  extractXmlAttr,
  extractXmlBlocks,
  extractXmlTag,
} from "@/lib/ebay/trading-client";
import { ebayListingUrl } from "@/lib/ebay/traffic-report-types";

export type EbayListingVariation = {
  sku: string | null;
  specifics: string;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  quantitySold: number | null;
  quantityAvailable: number | null;
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
  fetchedAt: string;
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

function formatSpecifics(variationXml: string): string {
  const lists = extractXmlBlocks(variationXml, "NameValueList");
  const parts: string[] = [];

  for (const list of lists) {
    const name = extractXmlTag(list, "Name");
    const value = extractXmlTag(list, "Value");
    if (name && value) {
      parts.push(`${name}: ${value}`);
    } else if (value) {
      parts.push(value);
    }
  }

  return parts.join(" · ");
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

  return {
    sku: extractXmlTag(variationXml, "SKU")?.trim() || null,
    specifics: formatSpecifics(variationXml),
    price,
    currency,
    quantity,
    quantitySold,
    quantityAvailable,
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
  <ItemID>${trimmedId}</ItemID>
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

  // Single-SKU listing: surface one synthetic variation row for a consistent table.
  const displayVariations =
    isMultiVariation
      ? variations
      : [
          {
            sku: extractXmlTag(itemXml, "SKU")?.trim() || null,
            specifics: "Single listing",
            price,
            currency,
            quantity,
            quantitySold,
            quantityAvailable,
          } satisfies EbayListingVariation,
        ];

  return {
    listingId: extractXmlTag(itemXml, "ItemID") ?? trimmedId,
    title: extractXmlTag(itemXml, "Title"),
    sku: extractXmlTag(itemXml, "SKU")?.trim() || null,
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
    variations: displayVariations,
    fetchedAt: new Date().toISOString(),
  };
}
