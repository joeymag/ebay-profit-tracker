import { getEbayApplicationAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";

export type BrowseItemDetails = {
  listingId: string;
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  condition: string | null;
  quantityAvailable: number | null;
  availabilityStatus: string | null;
  itemWebUrl: string | null;
  sku: string | null;
};

type BrowseItemResponse = {
  legacyItemId?: string;
  title?: string;
  image?: { imageUrl?: string };
  price?: { value?: string; currency?: string };
  condition?: string;
  estimatedAvailabilities?: Array<{
    estimatedAvailableQuantity?: number;
    estimatedAvailabilityStatus?: string;
  }>;
  itemWebUrl?: string;
  sku?: string;
  localizedAspects?: Array<{ name?: string; value?: string }>;
};

function parseBrowseItem(
  listingId: string,
  data: BrowseItemResponse,
): BrowseItemDetails {
  const availability = data.estimatedAvailabilities?.[0];
  const priceValue = data.price?.value
    ? Number.parseFloat(data.price.value)
    : null;

  return {
    listingId,
    title: data.title?.trim() || null,
    imageUrl: data.image?.imageUrl?.trim() || null,
    price: priceValue != null && Number.isFinite(priceValue) ? priceValue : null,
    currency: data.price?.currency?.trim() || null,
    condition: data.condition?.trim() || null,
    quantityAvailable:
      availability?.estimatedAvailableQuantity != null
        ? availability.estimatedAvailableQuantity
        : null,
    availabilityStatus:
      availability?.estimatedAvailabilityStatus?.trim() || null,
    itemWebUrl: data.itemWebUrl?.trim() || null,
    sku: data.sku?.trim() || null,
  };
}

export async function fetchBrowseItemByLegacyId(
  listingId: string,
  marketplaceId: string,
): Promise<BrowseItemDetails | null> {
  const { apiBaseUrl } = getEbayConfig();
  const accessToken = await getEbayApplicationAccessToken();
  const params = new URLSearchParams({
    legacy_item_id: listingId,
  });

  const response = await fetch(
    `${apiBaseUrl}/buy/browse/v1/item/get_item_by_legacy_id?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Accept-Language": "en-GB",
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      },
    },
  );

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }

    throw new EbayApiError(
      `eBay Browse API error (${response.status}) for listing ${listingId}`,
      response.status,
      text,
    );
  }

  const data = JSON.parse(text) as BrowseItemResponse;
  return parseBrowseItem(listingId, data);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch listing tiles/details for analytics rows (Browse API, app token). */
export async function fetchBrowseItemsByLegacyIds(
  listingIds: string[],
  marketplaceId: string,
): Promise<Map<string, BrowseItemDetails>> {
  const uniqueIds = [...new Set(listingIds.map((id) => id.trim()).filter(Boolean))];
  const results = new Map<string, BrowseItemDetails>();
  const batchSize = 5;

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batch = uniqueIds.slice(index, index + batchSize);
    const settled = await Promise.allSettled(
      batch.map((listingId) =>
        fetchBrowseItemByLegacyId(listingId, marketplaceId),
      ),
    );

    settled.forEach((outcome, batchIndex) => {
      const listingId = batch[batchIndex]!;
      if (outcome.status === "fulfilled" && outcome.value) {
        results.set(listingId, outcome.value);
      }
    });

    if (index + batchSize < uniqueIds.length) {
      await sleep(120);
    }
  }

  return results;
}
