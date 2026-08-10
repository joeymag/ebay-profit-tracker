import { ebayInventoryFetch } from "@/lib/ebay/inventory-client";
import { getEbayConfig } from "@/lib/ebay/config";
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
};

export type ActiveEbayListingsResult = {
  marketplaceId: string;
  listings: ActiveEbayListing[];
  inventoryItemsScanned: number;
  publishedCount: number;
  unpublishedCount: number;
  fetchedAt: string;
};

type InventoryItem = {
  sku?: string;
  product?: {
    title?: string;
    imageUrls?: string[];
  };
  availability?: {
    shipToLocationAvailability?: {
      quantity?: number;
    };
  };
};

type InventoryItemsResponse = {
  inventoryItems?: InventoryItem[];
  total?: number;
  size?: number;
  limit?: number;
  offset?: number;
  next?: string;
};

type EbayOffer = {
  offerId?: string;
  sku?: string;
  marketplaceId?: string;
  format?: string;
  status?: string;
  availableQuantity?: number;
  listing?: {
    listingId?: string;
    listingStatus?: string;
  };
  pricingSummary?: {
    price?: {
      value?: string;
      currency?: string;
    };
  };
};

type OffersResponse = {
  offers?: EbayOffer[];
  total?: number;
};

const INVENTORY_PAGE_SIZE = 100;
const OFFER_CONCURRENCY = 8;
const MAX_INVENTORY_ITEMS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAmount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : null;
}

function firstImageUrl(item: InventoryItem): string | null {
  const url = item.product?.imageUrls?.[0]?.trim();
  return url || null;
}

async function fetchAllInventoryItems(): Promise<InventoryItem[]> {
  const items: InventoryItem[] = [];
  let offset = 0;

  while (items.length < MAX_INVENTORY_ITEMS) {
    const data = await ebayInventoryFetch<InventoryItemsResponse>(
      `/inventory_item?limit=${INVENTORY_PAGE_SIZE}&offset=${offset}`,
    );
    const batch = data.inventoryItems ?? [];
    items.push(...batch);

    if (batch.length < INVENTORY_PAGE_SIZE) {
      break;
    }

    offset += INVENTORY_PAGE_SIZE;
    await sleep(100);
  }

  return items.slice(0, MAX_INVENTORY_ITEMS);
}

async function fetchOffersForSku(sku: string): Promise<EbayOffer[]> {
  const encodedSku = encodeURIComponent(sku);
  const data = await ebayInventoryFetch<OffersResponse>(
    `/offer?sku=${encodedSku}&limit=25`,
  );
  return data.offers ?? [];
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function isPublishedOffer(offer: EbayOffer): boolean {
  const status = offer.status?.trim().toUpperCase();
  const listingStatus = offer.listing?.listingStatus?.trim().toUpperCase();
  return status === "PUBLISHED" || listingStatus === "ACTIVE";
}

/**
 * Active (published) eBay listings via Inventory API — same OAuth token as fee sync.
 */
export async function fetchActiveEbayListings(): Promise<ActiveEbayListingsResult> {
  const { marketplaceId } = getEbayConfig();
  const inventoryItems = await fetchAllInventoryItems();

  const offersBySku = await mapWithConcurrency(
    inventoryItems,
    OFFER_CONCURRENCY,
    async (item) => {
      const sku = item.sku?.trim();
      if (!sku) {
        return [] as EbayOffer[];
      }

      try {
        return await fetchOffersForSku(sku);
      } catch {
        return [] as EbayOffer[];
      }
    },
  );

  const listings: ActiveEbayListing[] = [];
  let unpublishedCount = 0;

  inventoryItems.forEach((item, index) => {
    const sku = item.sku?.trim();
    if (!sku) {
      return;
    }

    const offers = offersBySku[index] ?? [];
    const publishedOffers = offers.filter(isPublishedOffer);
    const unpublishedOffers = offers.filter((offer) => !isPublishedOffer(offer));
    unpublishedCount += unpublishedOffers.length;

    if (!publishedOffers.length && !offers.length) {
      // Inventory SKU with no offer yet — skip from "active listings"
      return;
    }

    for (const offer of publishedOffers.length ? publishedOffers : []) {
      const listingId = offer.listing?.listingId?.trim() || null;
      const offerMarketplace = offer.marketplaceId?.trim() || marketplaceId;
      const price = parseAmount(offer.pricingSummary?.price?.value);
      const currency = offer.pricingSummary?.price?.currency?.trim() || null;
      const quantity =
        offer.availableQuantity ??
        item.availability?.shipToLocationAvailability?.quantity ??
        null;

      listings.push({
        sku,
        title: item.product?.title?.trim() || null,
        listingId,
        offerId: offer.offerId?.trim() || null,
        status: offer.status?.trim() || offer.listing?.listingStatus?.trim() || "PUBLISHED",
        format: offer.format?.trim() || null,
        marketplaceId: offerMarketplace,
        price,
        currency,
        quantity,
        imageUrl: firstImageUrl(item),
        itemWebUrl: listingId
          ? ebayListingUrl(listingId, offerMarketplace)
          : null,
      });
    }
  });

  listings.sort((a, b) => {
    const titleA = a.title?.toLowerCase() ?? a.sku.toLowerCase();
    const titleB = b.title?.toLowerCase() ?? b.sku.toLowerCase();
    return titleA.localeCompare(titleB, "en-GB");
  });

  return {
    marketplaceId,
    listings,
    inventoryItemsScanned: inventoryItems.length,
    publishedCount: listings.length,
    unpublishedCount,
    fetchedAt: new Date().toISOString(),
  };
}
