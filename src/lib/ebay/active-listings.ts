import { getEbayConfig } from "@/lib/ebay/config";
import { fetchEbayPromoRatesByListingId } from "@/lib/ebay/promo-rates";
import {
  ebayTradingCall,
  extractXmlAttr,
  extractXmlBlocks,
  extractXmlTag,
} from "@/lib/ebay/trading-client";
import { ebayListingUrl } from "@/lib/ebay/traffic-report-types";

export type ActiveEbayListing = {
  sku: string;
  title: string | null;
  listingId: string | null;
  offerId: string | null;
  status: string;
  format: string | null;
  marketplaceId: string;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  imageUrl: string | null;
  itemWebUrl: string | null;
  /** Promoted Listings ad rate percent (e.g. 12 = 12%). */
  promoRatePercent: number | null;
  promoAdStatus: string | null;
  promoCampaignName: string | null;
};

export type ActiveEbayListingsResult = {
  marketplaceId: string;
  listings: ActiveEbayListing[];
  /** Kept for UI compatibility — Trading API entry count. */
  inventoryItemsScanned: number;
  publishedCount: number;
  unpublishedCount: number;
  source: "trading";
  promoCampaignsScanned: number;
  promoAdsScanned: number;
  promoWarning: string | null;
  fetchedAt: string;
};

const ENTRIES_PER_PAGE = 200;
const MAX_PAGES = 25;

function parseAmount(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : null;
}

function parseItem(itemXml: string, marketplaceId: string): ActiveEbayListing | null {
  const listingId = extractXmlTag(itemXml, "ItemID");
  if (!listingId) {
    return null;
  }

  const sku = extractXmlTag(itemXml, "SKU")?.trim() || listingId;
  const title = extractXmlTag(itemXml, "Title");
  const listingType = extractXmlTag(itemXml, "ListingType");
  const quantityAvailable =
    parseAmount(extractXmlTag(itemXml, "QuantityAvailable")) ??
    parseAmount(extractXmlTag(itemXml, "Quantity"));
  const price =
    parseAmount(extractXmlTag(itemXml, "CurrentPrice")) ??
    parseAmount(extractXmlTag(itemXml, "BuyItNowPrice")) ??
    parseAmount(extractXmlTag(itemXml, "StartPrice"));
  const currency =
    extractXmlAttr(itemXml, "CurrentPrice", "currencyID") ??
    extractXmlAttr(itemXml, "BuyItNowPrice", "currencyID") ??
    extractXmlAttr(itemXml, "StartPrice", "currencyID");
  const listingStatus =
    extractXmlTag(itemXml, "ListingStatus") ?? "Active";
  const imageUrl =
    extractXmlTag(itemXml, "GalleryURL") ??
    extractXmlTag(itemXml, "PictureURL");

  return {
    sku,
    title,
    listingId,
    offerId: null,
    status: listingStatus,
    format: listingType,
    marketplaceId,
    price,
    currency,
    quantity: quantityAvailable,
    imageUrl,
    itemWebUrl: ebayListingUrl(listingId, marketplaceId),
    promoRatePercent: null,
    promoAdStatus: null,
    promoCampaignName: null,
  };
}

/**
 * Active eBay listings via Trading API GetMyeBaySelling (classic Seller Hub).
 * Uses the same OAuth user token as fee sync (X-EBAY-API-IAF-TOKEN).
 */
export async function fetchActiveEbayListings(): Promise<ActiveEbayListingsResult> {
  const { marketplaceId } = getEbayConfig();
  const listings: ActiveEbayListing[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= MAX_PAGES) {
    const xml = await ebayTradingCall(
      "GetMyeBaySelling",
      `
  <ErrorLanguage>en_GB</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ActiveList>
    <Include>true</Include>
    <IncludeWatchCount>false</IncludeWatchCount>
    <Pagination>
      <EntriesPerPage>${ENTRIES_PER_PAGE}</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>`,
    );

    const activeListXml = extractXmlTag(xml, "ActiveList") ?? "";
    const itemBlocks = extractXmlBlocks(activeListXml, "Item");
    for (const block of itemBlocks) {
      const listing = parseItem(block, marketplaceId);
      if (listing) {
        listings.push(listing);
      }
    }

    const totalPagesRaw =
      extractXmlTag(activeListXml, "TotalNumberOfPages") ??
      extractXmlTag(xml, "TotalNumberOfPages");
    totalPages = Math.max(1, Number.parseInt(totalPagesRaw ?? "1", 10) || 1);
    page += 1;
  }

  listings.sort((a, b) => {
    const titleA = a.title?.toLowerCase() ?? a.sku.toLowerCase();
    const titleB = b.title?.toLowerCase() ?? b.sku.toLowerCase();
    return titleA.localeCompare(titleB, "en-GB");
  });

  const promo = await fetchEbayPromoRatesByListingId();
  const enriched = listings.map((listing) => {
    const listingId = listing.listingId?.trim();
    if (!listingId) {
      return listing;
    }

    const rate = promo.ratesByListingId[listingId];
    if (!rate) {
      return listing;
    }

    return {
      ...listing,
      promoRatePercent: rate.bidPercentage,
      promoAdStatus: rate.adStatus,
      promoCampaignName: rate.campaignName,
    };
  });

  return {
    marketplaceId,
    listings: enriched,
    inventoryItemsScanned: enriched.length,
    publishedCount: enriched.length,
    unpublishedCount: 0,
    source: "trading",
    promoCampaignsScanned: promo.campaignsScanned,
    promoAdsScanned: promo.adsScanned,
    promoWarning: promo.warning,
    fetchedAt: new Date().toISOString(),
  };
}
