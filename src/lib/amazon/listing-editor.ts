import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { resolveAmazonSellerId } from "@/lib/amazon/pricing";
import {
  fetchAmazonListings,
  type AmazonListing,
} from "@/lib/amazon/listings";

export type AmazonListingImage = {
  role: "main" | `other_${number}`;
  url: string;
};

export type AmazonListingContent = {
  sku: string;
  asin: string | null;
  productType: string;
  title: string;
  description: string;
  bulletPoints: string[];
  genericKeywords: string;
  images: AmazonListingImage[];
  parentSku: string | null;
  childSkus: string[];
  parentage: "parent" | "child" | "standalone";
  status: string | null;
};

export type AmazonListingFamilyMember = AmazonListing & {
  parentSku: string | null;
  parentage: "parent" | "child" | "standalone";
};

export type AmazonListingFamily = {
  groupId: string;
  parentSku: string | null;
  title: string;
  imageUrl: string | null;
  members: AmazonListingFamilyMember[];
};

export type AmazonListingContentUpdate = {
  title?: string;
  description?: string;
  bulletPoints?: string[];
  genericKeywords?: string;
  imageUrls?: string[];
};

type AttributeValue = Record<string, unknown>;

type ListingsItemResponse = {
  sku?: string;
  summaries?: Array<{
    marketplaceId?: string;
    asin?: string;
    productType?: string;
    itemName?: string;
    status?: string[];
    mainImage?: { link?: string };
  }>;
  attributes?: Record<string, AttributeValue[] | undefined>;
  relationships?: Array<{
    marketplaceId?: string;
    type?: string;
    parentSkus?: string[];
    childSkus?: string[];
    variationTheme?: string[];
  }>;
};

type SearchListingsResponse = {
  items?: ListingsItemResponse[];
  pagination?: { nextToken?: string };
};

type PatchIssue = {
  code?: string;
  message?: string;
  severity?: string;
};

type PatchResponse = {
  sku?: string;
  status?: string;
  issues?: PatchIssue[];
};

function languageTagForMarketplace(marketplaceId: string): string {
  if (marketplaceId === "A1F83G8C2ARO7P") return "en_GB";
  if (marketplaceId === "A1PA6795UKMFR9") return "de_DE";
  return "en_GB";
}

function firstText(
  values: AttributeValue[] | undefined,
): string {
  if (!values?.length) return "";
  const raw = values[0]?.value;
  return typeof raw === "string" ? raw : "";
}

function allText(values: AttributeValue[] | undefined): string[] {
  if (!values?.length) return [];
  return values
    .map((entry) => (typeof entry.value === "string" ? entry.value.trim() : ""))
    .filter(Boolean);
}

function mediaUrl(values: AttributeValue[] | undefined): string | null {
  if (!values?.length) return null;
  const raw = values[0]?.media_location;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parseImages(
  attributes: Record<string, AttributeValue[] | undefined> | undefined,
): AmazonListingImage[] {
  if (!attributes) return [];
  const images: AmazonListingImage[] = [];
  const main = mediaUrl(attributes.main_product_image_locator);
  if (main) {
    images.push({ role: "main", url: main });
  }
  for (let index = 1; index <= 8; index += 1) {
    const url = mediaUrl(attributes[`other_product_image_locator_${index}`]);
    if (url) {
      images.push({ role: `other_${index}`, url });
    }
  }
  return images;
}

function textAttribute(
  value: string,
  marketplaceId: string,
  languageTag: string,
): AttributeValue[] {
  return [
    {
      value,
      language_tag: languageTag,
      marketplace_id: marketplaceId,
    },
  ];
}

function imageAttribute(
  url: string,
  marketplaceId: string,
): AttributeValue[] {
  return [
    {
      media_location: url,
      marketplace_id: marketplaceId,
    },
  ];
}

function relationshipMeta(item: ListingsItemResponse): {
  parentSku: string | null;
  childSkus: string[];
  parentage: "parent" | "child" | "standalone";
} {
  const rel = item.relationships?.[0];
  const parentSku = rel?.parentSkus?.[0]?.trim() || null;
  const childSkus = (rel?.childSkus ?? [])
    .map((sku) => sku.trim())
    .filter(Boolean);
  if (parentSku) {
    return { parentSku, childSkus, parentage: "child" };
  }
  if (childSkus.length > 0) {
    return { parentSku: null, childSkus, parentage: "parent" };
  }
  return { parentSku: null, childSkus: [], parentage: "standalone" };
}

function toContent(
  item: ListingsItemResponse,
  marketplaceId: string,
): AmazonListingContent {
  const summary = item.summaries?.[0];
  const attributes = item.attributes ?? {};
  const meta = relationshipMeta(item);
  const title =
    firstText(attributes.item_name) ||
    summary?.itemName?.trim() ||
    item.sku ||
    "";
  const bullets = allText(attributes.bullet_point);
  while (bullets.length < 5) bullets.push("");

  return {
    sku: item.sku?.trim() || "",
    asin: summary?.asin?.trim() || null,
    productType: summary?.productType?.trim() || "PRODUCT",
    title,
    description: firstText(attributes.product_description),
    bulletPoints: bullets.slice(0, 5),
    genericKeywords: firstText(attributes.generic_keyword),
    images: parseImages(attributes),
    parentSku: meta.parentSku,
    childSkus: meta.childSkus,
    parentage: meta.parentage,
    status: summary?.status?.[0] ?? null,
  };
}

async function getListingsItem(
  sellerId: string,
  sku: string,
  marketplaceId: string,
): Promise<ListingsItemResponse> {
  return amazonFetch<ListingsItemResponse>({
    path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
    query: {
      marketplaceIds: marketplaceId,
      includedData: "summaries,attributes,relationships",
      issueLocale: languageTagForMarketplace(marketplaceId),
    },
  });
}

/**
 * Load editable content + variation relationships for one SKU.
 */
export async function fetchAmazonListingContent(
  sku: string,
): Promise<AmazonListingContent> {
  const { marketplaceId } = getAmazonConfig();
  const sellerId = await resolveAmazonSellerId(sku);
  const item = await getListingsItem(sellerId, sku, marketplaceId);
  const content = toContent(item, marketplaceId);
  if (!content.sku) content.sku = sku;
  return content;
}

/**
 * Load the active SKU plus its variation family members (parent + children).
 */
export async function fetchAmazonListingFamilyBySku(sku: string): Promise<{
  content: AmazonListingContent;
  familySkus: string[];
}> {
  const content = await fetchAmazonListingContent(sku);
  const family = new Set<string>([content.sku]);

  if (content.parentage === "parent") {
    for (const child of content.childSkus) family.add(child);
  } else if (content.parentage === "child" && content.parentSku) {
    family.add(content.parentSku);
    try {
      const parent = await fetchAmazonListingContent(content.parentSku);
      for (const child of parent.childSkus) family.add(child);
    } catch {
      // Keep child + known parent even if parent detail fails.
    }
  }

  return {
    content,
    familySkus: [...family],
  };
}

/**
 * Best-effort parent/child map from Listings Items search (for list grouping).
 */
export async function fetchAmazonVariationParentMap(
  seedSku?: string,
): Promise<Map<string, { parentSku: string | null; parentage: AmazonListingContent["parentage"] }>> {
  const map = new Map<
    string,
    { parentSku: string | null; parentage: AmazonListingContent["parentage"] }
  >();
  const { marketplaceId } = getAmazonConfig();
  let sellerId: string;
  try {
    sellerId = await resolveAmazonSellerId(seedSku);
  } catch {
    return map;
  }

  let pageToken: string | undefined;
  for (let page = 0; page < 15; page += 1) {
    const data = await amazonFetch<SearchListingsResponse>({
      path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`,
      query: {
        marketplaceIds: marketplaceId,
        includedData: "summaries,relationships",
        pageSize: "20",
        ...(pageToken ? { pageToken } : {}),
      },
    });

    for (const item of data.items ?? []) {
      const sku = item.sku?.trim();
      if (!sku) continue;
      const meta = relationshipMeta(item);
      map.set(sku, {
        parentSku: meta.parentSku,
        parentage: meta.parentage,
      });
      if (meta.parentage === "parent") {
        for (const child of meta.childSkus) {
          map.set(child, { parentSku: sku, parentage: "child" });
        }
      }
    }

    pageToken = data.pagination?.nextToken;
    if (!pageToken) break;
  }

  return map;
}

export function groupAmazonListings(
  listings: AmazonListing[],
  parentMap?: Map<
    string,
    { parentSku: string | null; parentage: AmazonListingContent["parentage"] }
  >,
): AmazonListingFamily[] {
  const bySku = new Map(listings.map((row) => [row.sku, row]));
  const used = new Set<string>();
  const families: AmazonListingFamily[] = [];

  const membersFor = (skus: string[]): AmazonListingFamilyMember[] => {
    const members: AmazonListingFamilyMember[] = [];
    for (const sku of skus) {
      const listing = bySku.get(sku);
      if (!listing) continue;
      const meta = parentMap?.get(sku);
      members.push({
        ...listing,
        parentSku: meta?.parentSku ?? null,
        parentage: meta?.parentage ?? "standalone",
      });
      used.add(sku);
    }
    return members;
  };

  for (const listing of listings) {
    if (used.has(listing.sku)) continue;
    const meta = parentMap?.get(listing.sku);
    if (!meta || meta.parentage === "standalone") {
      families.push({
        groupId: listing.sku || listing.listingId,
        parentSku: null,
        title: listing.title,
        imageUrl: listing.imageUrl,
        members: membersFor([listing.sku]),
      });
      continue;
    }

    if (meta.parentage === "parent") {
      const children = [...parentMap!.entries()]
        .filter(([, value]) => value.parentSku === listing.sku)
        .map(([sku]) => sku);
      const members = membersFor([listing.sku, ...children]);
      families.push({
        groupId: listing.sku,
        parentSku: listing.sku,
        title: listing.title,
        imageUrl: listing.imageUrl,
        members,
      });
      continue;
    }

    const parentSku = meta.parentSku;
    if (parentSku && used.has(parentSku)) continue;
    if (parentSku && bySku.has(parentSku)) {
      const parent = bySku.get(parentSku)!;
      const children = [...parentMap!.entries()]
        .filter(([, value]) => value.parentSku === parentSku)
        .map(([sku]) => sku);
      const members = membersFor([parentSku, ...children]);
      families.push({
        groupId: parentSku,
        parentSku,
        title: parent.title,
        imageUrl: parent.imageUrl,
        members,
      });
      continue;
    }

    // Child without parent row in the report — still group known siblings.
    const siblings = parentSku
      ? [...parentMap!.entries()]
          .filter(([, value]) => value.parentSku === parentSku)
          .map(([sku]) => sku)
      : [listing.sku];
    const members = membersFor(siblings);
    families.push({
      groupId: parentSku || listing.sku,
      parentSku,
      title: listing.title,
      imageUrl: listing.imageUrl,
      members,
    });
  }

  return families.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

export async function listAmazonListingFamilies(options?: {
  forceRefresh?: boolean;
  fast?: boolean;
  /** When false, skip SP-API relationship enrichment (flat groups only). */
  includeRelationships?: boolean;
}): Promise<{
  families: AmazonListingFamily[];
  listings: AmazonListing[];
  fetchedAt: string;
  cached: boolean;
  marketplaceId: string;
  relationshipsLoaded: boolean;
}> {
  const forceRefresh = options?.forceRefresh === true;
  const fast = options?.fast !== false && !forceRefresh;
  const includeRelationships = options?.includeRelationships !== false;

  const result = await fetchAmazonListings({ forceRefresh, fast });
  let parentMap = new Map<
    string,
    { parentSku: string | null; parentage: AmazonListingContent["parentage"] }
  >();
  let relationshipsLoaded = false;
  if (includeRelationships) {
    try {
      parentMap = await fetchAmazonVariationParentMap(result.listings[0]?.sku);
      relationshipsLoaded = parentMap.size > 0;
    } catch {
      relationshipsLoaded = false;
    }
  }

  return {
    families: groupAmazonListings(result.listings, parentMap),
    listings: result.listings,
    fetchedAt: result.fetchedAt,
    cached: result.cached,
    marketplaceId: result.marketplaceId,
    relationshipsLoaded,
  };
}

function buildPatches(
  update: AmazonListingContentUpdate,
  marketplaceId: string,
  languageTag: string,
): Array<{ op: "replace"; path: string; value: AttributeValue[] }> {
  const patches: Array<{
    op: "replace";
    path: string;
    value: AttributeValue[];
  }> = [];

  if (update.title != null) {
    patches.push({
      op: "replace",
      path: "/attributes/item_name",
      value: textAttribute(update.title.trim(), marketplaceId, languageTag),
    });
  }

  if (update.description != null) {
    patches.push({
      op: "replace",
      path: "/attributes/product_description",
      value: textAttribute(
        update.description.trim(),
        marketplaceId,
        languageTag,
      ),
    });
  }

  if (update.bulletPoints != null) {
    const bullets = update.bulletPoints
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((value) => ({
        value,
        language_tag: languageTag,
        marketplace_id: marketplaceId,
      }));
    if (bullets.length) {
      patches.push({
        op: "replace",
        path: "/attributes/bullet_point",
        value: bullets,
      });
    }
  }

  if (update.genericKeywords != null) {
    patches.push({
      op: "replace",
      path: "/attributes/generic_keyword",
      value: textAttribute(
        update.genericKeywords.trim(),
        marketplaceId,
        languageTag,
      ),
    });
  }

  if (update.imageUrls != null) {
    const urls = update.imageUrls.map((url) => url.trim()).filter(Boolean);
    if (urls[0]) {
      patches.push({
        op: "replace",
        path: "/attributes/main_product_image_locator",
        value: imageAttribute(urls[0], marketplaceId),
      });
    }
    for (let index = 1; index <= 8; index += 1) {
      const url = urls[index];
      if (!url) continue;
      patches.push({
        op: "replace",
        path: `/attributes/other_product_image_locator_${index}`,
        value: imageAttribute(url, marketplaceId),
      });
    }
  }

  return patches;
}

/**
 * Push content edits to Amazon for one SKU via Listings Items PATCH.
 */
export async function updateAmazonListingContent(
  sku: string,
  update: AmazonListingContentUpdate,
  options?: { productType?: string },
): Promise<{ sku: string; status: string; issues: PatchIssue[] }> {
  const { marketplaceId } = getAmazonConfig();
  const languageTag = languageTagForMarketplace(marketplaceId);
  const sellerId = await resolveAmazonSellerId(sku);

  let productType = options?.productType?.trim() || "";
  if (!productType) {
    try {
      const current = await getListingsItem(sellerId, sku, marketplaceId);
      productType = current.summaries?.[0]?.productType?.trim() || "PRODUCT";
    } catch {
      productType = "PRODUCT";
    }
  }

  const patches = buildPatches(update, marketplaceId, languageTag);
  if (!patches.length) {
    throw new Error("No listing changes to save.");
  }

  const result = await amazonFetch<PatchResponse>({
    method: "PATCH",
    path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
    query: {
      marketplaceIds: marketplaceId,
      issueLocale: languageTag,
    },
    body: {
      productType,
      patches,
    },
  });

  return {
    sku,
    status: result.status || "ACCEPTED",
    issues: result.issues ?? [],
  };
}

/**
 * Push the same content fields to every SKU in a variation family.
 */
export async function updateAmazonListingFamilyContent(
  skus: string[],
  update: AmazonListingContentUpdate,
): Promise<
  Array<{ sku: string; ok: boolean; status?: string; error?: string; issues?: PatchIssue[] }>
> {
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  const results: Array<{
    sku: string;
    ok: boolean;
    status?: string;
    error?: string;
    issues?: PatchIssue[];
  }> = [];

  for (const sku of unique) {
    try {
      const saved = await updateAmazonListingContent(sku, update);
      results.push({
        sku,
        ok: true,
        status: saved.status,
        issues: saved.issues,
      });
    } catch (error) {
      results.push({
        sku,
        ok: false,
        error:
          error instanceof AmazonApiError
            ? `${error.message}: ${error.body.slice(0, 240)}`
            : error instanceof Error
              ? error.message
              : "Save failed.",
      });
    }
  }

  return results;
}
