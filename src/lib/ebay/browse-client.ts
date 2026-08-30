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
  isItemGroup: boolean;
  variationCount: number | null;
  memberSkus: string[];
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
};

type BrowseErrorResponse = {
  errors?: Array<{
    errorId?: number;
    parameters?: Array<{ name?: string; value?: string }>;
  }>;
};

type ItemGroupResponse = {
  items?: BrowseItemResponse[];
};

function parseBrowseItem(
  listingId: string,
  data: BrowseItemResponse,
  options?: {
    isItemGroup?: boolean;
    variationCount?: number | null;
    memberSkus?: string[];
  },
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
    isItemGroup: options?.isItemGroup ?? false,
    variationCount: options?.variationCount ?? null,
    memberSkus: options?.memberSkus ?? (data.sku?.trim() ? [data.sku.trim()] : []),
  };
}

export type BrowseGroupMember = {
  sku: string | null;
  price: number | null;
  currency: string | null;
  quantityAvailable: number | null;
  specificsPairs: Array<{ name: string; value: string }>;
};

type BrowseLocalizedAspect = {
  name?: string;
  value?: string;
};

function parseBrowseGroupMember(data: BrowseItemResponse): BrowseGroupMember {
  const availability = data.estimatedAvailabilities?.[0];
  const priceValue = data.price?.value
    ? Number.parseFloat(data.price.value)
    : null;
  const specificsPairs = (data as BrowseItemResponse & {
    localizedAspects?: BrowseLocalizedAspect[];
  }).localizedAspects
    ?.map((aspect) => ({
      name: aspect.name?.trim() ?? "",
      value: aspect.value?.trim() ?? "",
    }))
    .filter((pair) => pair.name && pair.value) ?? [];

  return {
    sku: data.sku?.trim() || null,
    price: priceValue != null && Number.isFinite(priceValue) ? priceValue : null,
    currency: data.price?.currency?.trim() || null,
    quantityAvailable:
      availability?.estimatedAvailableQuantity != null
        ? availability.estimatedAvailableQuantity
        : null,
    specificsPairs,
  };
}

/**
 * All variation rows for a multi-variation listing (Browse API item group).
 */
export async function fetchBrowseGroupMembersByListingId(
  listingId: string,
): Promise<BrowseGroupMember[] | null> {
  const { marketplaceId } = getEbayConfig();
  const trimmedId = listingId.trim();
  if (!trimmedId) {
    return null;
  }

  const params = new URLSearchParams({
    legacy_item_id: trimmedId,
  });
  const response = await browseFetch(
    `/item/get_item_by_legacy_id?${params.toString()}`,
    marketplaceId,
  );
  const text = await response.text();

  if (response.ok) {
    const data = JSON.parse(text) as BrowseItemResponse;
    return [parseBrowseGroupMember(data)];
  }

  if (response.status !== 400) {
    return null;
  }

  const itemGroupId = itemGroupIdFromBrowseError(text, trimmedId);
  if (!itemGroupId) {
    return null;
  }

  const groupParams = new URLSearchParams({ item_group_id: itemGroupId });
  const groupResponse = await browseFetch(
    `/item/get_items_by_item_group?${groupParams.toString()}`,
    marketplaceId,
  );
  const groupText = await groupResponse.text();
  if (!groupResponse.ok) {
    return null;
  }

  const groupData = JSON.parse(groupText) as ItemGroupResponse;
  const items = groupData.items ?? [];
  if (!items.length) {
    return null;
  }

  return items.map(parseBrowseGroupMember);
}

function itemGroupIdFromBrowseError(
  body: string,
  listingId: string,
): string | null {
  try {
    const parsed = JSON.parse(body) as BrowseErrorResponse;
    for (const error of parsed.errors ?? []) {
      if (error.errorId !== 11006) {
        continue;
      }

      const href = error.parameters?.find(
        (parameter) => parameter.name === "itemGroupHref",
      )?.value;

      if (href) {
        const groupId = new URL(href).searchParams.get("item_group_id");
        if (groupId?.trim()) {
          return groupId.trim();
        }
      }
    }
  } catch {
    // Fall through to listing ID fallback below.
  }

  return listingId;
}

async function browseFetch(path: string, marketplaceId: string): Promise<Response> {
  const { apiBaseUrl } = getEbayConfig();
  const accessToken = await getEbayApplicationAccessToken();

  return fetch(`${apiBaseUrl}/buy/browse/v1${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Accept-Language": "en-GB",
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
    },
  });
}

async function fetchBrowseItemGroupById(
  itemGroupId: string,
  listingId: string,
  marketplaceId: string,
): Promise<BrowseItemDetails | null> {
  const params = new URLSearchParams({ item_group_id: itemGroupId });
  const response = await browseFetch(
    `/item/get_items_by_item_group?${params.toString()}`,
    marketplaceId,
  );
  const text = await response.text();

  if (!response.ok) {
    return null;
  }

  const data = JSON.parse(text) as ItemGroupResponse;
  const items = data.items ?? [];
  if (!items.length) {
    return null;
  }

  const primary = items[0]!;
  const memberSkus = [
    ...new Set(
      items
        .map((item) => item.sku?.trim())
        .filter((sku): sku is string => Boolean(sku)),
    ),
  ];

  return parseBrowseItem(listingId, primary, {
    isItemGroup: true,
    variationCount: items.length,
    memberSkus,
  });
}

export async function fetchBrowseItemByLegacyId(
  listingId: string,
  marketplaceId: string,
): Promise<BrowseItemDetails | null> {
  const params = new URLSearchParams({
    legacy_item_id: listingId,
  });

  const response = await browseFetch(
    `/item/get_item_by_legacy_id?${params.toString()}`,
    marketplaceId,
  );
  const text = await response.text();

  if (response.ok) {
    const data = JSON.parse(text) as BrowseItemResponse;
    return parseBrowseItem(listingId, data);
  }

  if (response.status === 404) {
    return null;
  }

  if (response.status === 400) {
    const itemGroupId = itemGroupIdFromBrowseError(text, listingId);
    if (itemGroupId) {
      const groupItem = await fetchBrowseItemGroupById(
        itemGroupId,
        listingId,
        marketplaceId,
      );
      if (groupItem) {
        return groupItem;
      }
    }

    return null;
  }

  throw new EbayApiError(
    `eBay Browse API error (${response.status}) for listing ${listingId}`,
    response.status,
    text,
  );
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
      batch.map((id) => fetchBrowseItemByLegacyId(id, marketplaceId)),
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
