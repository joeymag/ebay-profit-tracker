import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { loadAmazonListingsFromDb } from "@/lib/amazon/amazon-listings-store";
import { resolveAmazonSellerId } from "@/lib/amazon/pricing";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import {
  effectiveAmazonListingImageUrl,
  type AmazonListing,
} from "@/lib/amazon/listings-shared";

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

/** Inner VARIATION / PACKAGE_HIERARCHY edge from Listings Items. */
type ItemRelationship = {
  type?: string;
  parentSkus?: string[];
  childSkus?: string[];
  variationTheme?:
    | string[]
    | {
        theme?: string;
        attributes?: string[];
      };
};

/**
 * Amazon nests edges under marketplace wrappers:
 * relationships: [{ marketplaceId, relationships: [{ type, childSkus, parentSkus }] }]
 * Older/flat shapes may put childSkus/parentSkus on the top entry — support both.
 */
type MarketplaceRelationships = {
  marketplaceId?: string;
  type?: string;
  parentSkus?: string[];
  childSkus?: string[];
  variationTheme?: ItemRelationship["variationTheme"];
  relationships?: ItemRelationship[];
};

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
  relationships?: MarketplaceRelationships[];
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

function collectRelationshipEdges(
  item: ListingsItemResponse,
): ItemRelationship[] {
  const edges: ItemRelationship[] = [];
  for (const wrapper of item.relationships ?? []) {
    const nested = wrapper.relationships;
    if (Array.isArray(nested) && nested.length > 0) {
      for (const edge of nested) edges.push(edge);
      continue;
    }
    // Flat / legacy shape on the marketplace entry itself.
    if (
      (wrapper.childSkus?.length ?? 0) > 0 ||
      (wrapper.parentSkus?.length ?? 0) > 0 ||
      wrapper.type
    ) {
      edges.push({
        type: wrapper.type,
        parentSkus: wrapper.parentSkus,
        childSkus: wrapper.childSkus,
        variationTheme: wrapper.variationTheme,
      });
    }
  }
  return edges;
}

function attributeParentSku(
  attributes: Record<string, AttributeValue[] | undefined> | undefined,
): string | null {
  const rows = attributes?.child_parent_sku_relationship;
  if (!rows?.length) return null;
  for (const row of rows) {
    const parent =
      (typeof row.parent_sku === "string" && row.parent_sku.trim()) ||
      (typeof row.parentSku === "string" && row.parentSku.trim()) ||
      "";
    if (parent) return parent;
  }
  return null;
}

function attributeParentageLevel(
  attributes: Record<string, AttributeValue[] | undefined> | undefined,
): "parent" | "child" | null {
  const raw = firstText(attributes?.parentage_level).trim().toLowerCase();
  if (raw === "parent") return "parent";
  if (raw === "child") return "child";
  return null;
}

function relationshipMeta(item: ListingsItemResponse): {
  parentSku: string | null;
  childSkus: string[];
  parentage: "parent" | "child" | "standalone";
} {
  const edges = collectRelationshipEdges(item);
  // Prefer VARIATION; fall back to any edge that names parents/children.
  const rel =
    edges.find((edge) => (edge.type ?? "VARIATION").toUpperCase() === "VARIATION") ??
    edges[0];

  let parentSku = rel?.parentSkus?.[0]?.trim() || null;
  let childSkus = (rel?.childSkus ?? [])
    .map((sku) => sku.trim())
    .filter(Boolean);

  if (!parentSku) {
    parentSku = attributeParentSku(item.attributes);
  }
  const level = attributeParentageLevel(item.attributes);

  if (parentSku) {
    return { parentSku, childSkus, parentage: "child" };
  }
  if (childSkus.length > 0 || level === "parent") {
    return { parentSku: null, childSkus, parentage: "parent" };
  }
  // parentage_level=child without parent SKU can't be grouped yet.
  return { parentSku: null, childSkus: [], parentage: "standalone" };
}

function normalizeSkuKey(sku: string): string {
  return sku.trim().toLowerCase();
}

/**
 * Infer parent SKU from common seller patterns:
 * PARENT + PARENT-RED / PARENT_S / PARENT/M when PARENT also exists (or longest shared stem).
 */
function inferFamiliesFromSkuPatterns(
  skus: string[],
): Map<string, { parentSku: string | null; parentage: AmazonListingContent["parentage"] }> {
  const map = new Map<
    string,
    { parentSku: string | null; parentage: AmazonListingContent["parentage"] }
  >();
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  if (unique.length < 2) return map;

  const byKey = new Map(unique.map((sku) => [normalizeSkuKey(sku), sku]));
  const sorted = [...unique].sort((a, b) => a.length - b.length);

  for (const candidate of sorted) {
    const prefix = normalizeSkuKey(candidate);
    if (prefix.length < 3) continue;
    const children: string[] = [];
    for (const other of unique) {
      if (other === candidate) continue;
      const key = normalizeSkuKey(other);
      if (!key.startsWith(prefix)) continue;
      const remainder = key.slice(prefix.length);
      if (/^[-_/\s].+/.test(remainder)) {
        children.push(byKey.get(key) || other);
      }
    }
    if (children.length === 0) continue;
    map.set(candidate, { parentSku: null, parentage: "parent" });
    for (const child of children) {
      // Prefer the longest matching parent prefix.
      const existing = map.get(child);
      if (
        existing?.parentage === "child" &&
        existing.parentSku &&
        existing.parentSku.length >= candidate.length
      ) {
        continue;
      }
      map.set(child, { parentSku: candidate, parentage: "child" });
    }
  }

  return map;
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

  const images = parseImages(attributes);
  const summaryImage = summary?.mainImage?.link?.trim();
  if (summaryImage && !images.some((image) => image.role === "main")) {
    images.unshift({ role: "main", url: summaryImage });
  } else if (summaryImage && images.length === 0) {
    images.push({ role: "main", url: summaryImage });
  }

  return {
    sku: item.sku?.trim() || "",
    asin: summary?.asin?.trim() || null,
    productType: summary?.productType?.trim() || "PRODUCT",
    title,
    description: firstText(attributes.product_description),
    bulletPoints: bullets.slice(0, 5),
    genericKeywords: firstText(attributes.generic_keyword),
    images,
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

type VariationMeta = {
  parentSku: string | null;
  parentage: AmazonListingContent["parentage"];
};

function mergeVariationMeta(
  map: Map<string, VariationMeta>,
  sku: string,
  meta: VariationMeta,
): void {
  const key = sku.trim();
  if (!key) return;
  const existing = map.get(key);
  // Prefer explicit parent/child over standalone; keep child→parent links.
  if (!existing || existing.parentage === "standalone") {
    map.set(key, meta);
    return;
  }
  if (meta.parentage === "standalone") return;
  if (meta.parentage === "child" && meta.parentSku) {
    map.set(key, meta);
    return;
  }
  if (meta.parentage === "parent" && existing.parentage !== "child") {
    map.set(key, meta);
  }
}

function listingItemImageUrl(item: ListingsItemResponse): string | null {
  const summaryLink = item.summaries?.[0]?.mainImage?.link?.trim() || null;
  if (effectiveAmazonListingImageUrl(summaryLink)) return summaryLink;
  const fromAttributes = mediaUrl(item.attributes?.main_product_image_locator);
  return effectiveAmazonListingImageUrl(fromAttributes);
}

function applyItemToVariationMap(
  map: Map<string, VariationMeta>,
  images: Map<string, string>,
  item: ListingsItemResponse,
): void {
  const sku = item.sku?.trim();
  if (!sku) return;
  const meta = relationshipMeta(item);
  mergeVariationMeta(map, sku, {
    parentSku: meta.parentSku,
    parentage: meta.parentage,
  });
  if (meta.parentage === "parent") {
    for (const child of meta.childSkus) {
      mergeVariationMeta(map, child, { parentSku: sku, parentage: "child" });
    }
  }
  if (meta.parentage === "child" && meta.parentSku) {
    mergeVariationMeta(map, meta.parentSku, {
      parentSku: null,
      parentage: "parent",
    });
  }
  const imageUrl = listingItemImageUrl(item);
  if (imageUrl) {
    images.set(sku, imageUrl);
    images.set(normalizeSkuKey(sku), imageUrl);
  }
}

/**
 * Parent/child map + real main-image URLs for inventory-report SKUs.
 */
export async function fetchAmazonVariationParentMap(
  seedSku?: string,
  listingSkus: string[] = [],
): Promise<{
  parentMap: Map<string, VariationMeta>;
  imageBySku: Map<string, string>;
}> {
  const map = new Map<string, VariationMeta>();
  const images = new Map<string, string>();
  const { marketplaceId } = getAmazonConfig();
  let sellerId: string;
  try {
    sellerId = await resolveAmazonSellerId(seedSku || listingSkus[0]);
  } catch {
    return { parentMap: map, imageBySku: images };
  }

  const wanted = [
    ...new Set(listingSkus.map((sku) => sku.trim()).filter(Boolean)),
  ];
  const batchSize = 20;
  for (let offset = 0; offset < wanted.length; offset += batchSize) {
    const batch = wanted.slice(offset, offset + batchSize);
    try {
      const data = await amazonFetch<SearchListingsResponse>({
        path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`,
        query: {
          marketplaceIds: marketplaceId,
          identifiers: batch.join(","),
          identifiersType: "SKU",
          includedData: "summaries,attributes,relationships",
          pageSize: String(Math.min(20, batch.length)),
        },
      });
      for (const item of data.items ?? []) {
        applyItemToVariationMap(map, images, item);
      }
    } catch {
      // Fall through to paged search / SKU heuristics.
    }
  }

  // Catalog sweep fills parents that aren't in the merchant listings report.
  let pageToken: string | undefined;
  for (let page = 0; page < 15; page += 1) {
    try {
      const data = await amazonFetch<SearchListingsResponse>({
        path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`,
        query: {
          marketplaceIds: marketplaceId,
          includedData: "summaries,attributes,relationships",
          pageSize: "20",
          ...(pageToken ? { pageToken } : {}),
        },
      });

      for (const item of data.items ?? []) {
        applyItemToVariationMap(map, images, item);
      }

      pageToken = data.pagination?.nextToken;
      if (!pageToken) break;
    } catch {
      break;
    }
  }

  // SKU-prefix fallback for report rows Amazon didn't link (or only partially linked).
  const linked = new Set(
    [...map.entries()]
      .filter(
        ([, meta]) =>
          meta.parentage === "parent" || meta.parentage === "child",
      )
      .map(([sku]) => normalizeSkuKey(sku)),
  );
  const unlinked = wanted.filter(
    (sku) => !linked.has(normalizeSkuKey(sku)),
  );
  if (unlinked.length > 1) {
    for (const [sku, meta] of inferFamiliesFromSkuPatterns([
      ...unlinked,
      // Include known parents so PREFIX matching can attach children to them.
      ...[...map.entries()]
        .filter(([, meta]) => meta.parentage === "parent")
        .map(([sku]) => sku),
    ])) {
      mergeVariationMeta(map, sku, meta);
    }
  }

  return { parentMap: map, imageBySku: images };
}

function applyImagesToListings(
  listings: AmazonListing[],
  imageBySku: Map<string, string>,
): AmazonListing[] {
  if (imageBySku.size === 0) {
    return listings.map((listing) => ({
      ...listing,
      imageUrl: effectiveAmazonListingImageUrl(listing.imageUrl),
    }));
  }

  return listings.map((listing) => {
    const fromApi =
      imageBySku.get(listing.sku) ||
      imageBySku.get(normalizeSkuKey(listing.sku)) ||
      null;
    const current = effectiveAmazonListingImageUrl(listing.imageUrl);
    return {
      ...listing,
      imageUrl: fromApi || current,
    };
  });
}

function resolveListingSku(
  bySku: Map<string, AmazonListing>,
  bySkuNormalized: Map<string, AmazonListing>,
  sku: string,
): AmazonListing | undefined {
  return bySku.get(sku) ?? bySkuNormalized.get(normalizeSkuKey(sku));
}

export function groupAmazonListings(
  listings: AmazonListing[],
  parentMap?: Map<string, VariationMeta>,
): AmazonListingFamily[] {
  const bySku = new Map(listings.map((row) => [row.sku, row]));
  const bySkuNormalized = new Map(
    listings.map((row) => [normalizeSkuKey(row.sku), row]),
  );
  const used = new Set<string>();
  const families: AmazonListingFamily[] = [];
  const map = parentMap ?? new Map<string, VariationMeta>();

  const metaFor = (sku: string): VariationMeta | undefined => {
    const direct = map.get(sku);
    if (direct) return direct;
    const key = normalizeSkuKey(sku);
    for (const [mapSku, meta] of map) {
      if (normalizeSkuKey(mapSku) === key) return meta;
    }
    return undefined;
  };

  const childrenOf = (parentSku: string): string[] => {
    const parentKey = normalizeSkuKey(parentSku);
    const children: string[] = [];
    const seen = new Set<string>();
    for (const [sku, value] of map.entries()) {
      if (value.parentage !== "child" || !value.parentSku) continue;
      if (
        value.parentSku !== parentSku &&
        normalizeSkuKey(value.parentSku) !== parentKey
      ) {
        continue;
      }
      const listing = resolveListingSku(bySku, bySkuNormalized, sku);
      const childSku = listing?.sku ?? sku;
      if (seen.has(normalizeSkuKey(childSku))) continue;
      seen.add(normalizeSkuKey(childSku));
      children.push(childSku);
    }
    return children;
  };

  const membersFor = (skus: string[]): AmazonListingFamilyMember[] => {
    const members: AmazonListingFamilyMember[] = [];
    const seen = new Set<string>();
    for (const sku of skus) {
      const listing = resolveListingSku(bySku, bySkuNormalized, sku);
      if (!listing || seen.has(listing.sku)) continue;
      seen.add(listing.sku);
      const meta = metaFor(listing.sku);
      members.push({
        ...listing,
        parentSku: meta?.parentSku ?? null,
        parentage: meta?.parentage ?? "standalone",
      });
      used.add(listing.sku);
      used.add(normalizeSkuKey(listing.sku));
    }
    return members;
  };

  const pushFamily = (
    groupId: string,
    parentSku: string | null,
    anchor: AmazonListing,
    memberSkus: string[],
  ) => {
    const members = membersFor(memberSkus);
    if (members.length === 0) return;

    // Inventory reports often omit the parent SKU. Keep the real parent SKU as
    // the family head so Edit/chevron target the parent, not the first child.
    if (
      parentSku &&
      members.length >= 1 &&
      !members.some(
        (member) => normalizeSkuKey(member.sku) === normalizeSkuKey(parentSku),
      )
    ) {
      members.unshift({
        listingId: parentSku,
        sku: parentSku,
        asin: null,
        title: anchor.title,
        price: null,
        quantity: null,
        fulfillmentChannel: null,
        condition: null,
        imageUrl: anchor.imageUrl,
        openDate: null,
        productUrl: null,
        parentSku: null,
        parentage: "parent",
      });
      used.add(parentSku);
      used.add(normalizeSkuKey(parentSku));
    }

    // Ensure at most one parent tag; everyone else under a multi-member group is a child.
    if (members.length > 1) {
      let parent =
        members.find((member) => member.parentage === "parent") ??
        members.find((member) => member.sku === parentSku) ??
        null;
      if (!parent && parentSku) {
        parent = members.find(
          (member) => normalizeSkuKey(member.sku) === normalizeSkuKey(parentSku),
        ) ?? null;
      }
      if (!parent) parent = members[0]!;
      for (const member of members) {
        if (member.sku === parent.sku) {
          member.parentage = "parent";
          member.parentSku = null;
        } else {
          member.parentage = "child";
          member.parentSku = parent.sku;
        }
      }
    }
    const imageUrl =
      effectiveAmazonListingImageUrl(anchor.imageUrl) ||
      members
        .map((member) => effectiveAmazonListingImageUrl(member.imageUrl))
        .find(Boolean) ||
      null;

    families.push({
      groupId,
      parentSku: parentSku,
      title: anchor.title,
      imageUrl,
      members: members.map((member) => ({
        ...member,
        imageUrl: effectiveAmazonListingImageUrl(member.imageUrl),
      })),
    });
  };

  // 1) Explicit parents first.
  for (const listing of listings) {
    if (used.has(listing.sku) || used.has(normalizeSkuKey(listing.sku))) {
      continue;
    }
    const meta = metaFor(listing.sku);
    if (meta?.parentage !== "parent") continue;
    const childSkus = childrenOf(listing.sku);
    pushFamily(listing.sku, listing.sku, listing, [
      listing.sku,
      ...childSkus,
    ]);
  }

  // 2) Children whose parent may be missing from the report — group siblings.
  for (const listing of listings) {
    if (used.has(listing.sku) || used.has(normalizeSkuKey(listing.sku))) {
      continue;
    }
    const meta = metaFor(listing.sku);
    if (meta?.parentage !== "child" || !meta.parentSku) continue;

    const parentSku = meta.parentSku;
    if (used.has(parentSku) || used.has(normalizeSkuKey(parentSku))) {
      // Parent family already created — attach if somehow skipped (shouldn't happen).
      continue;
    }

    const parentListing = resolveListingSku(bySku, bySkuNormalized, parentSku);
    const siblings = childrenOf(parentSku);
    if (parentListing) {
      pushFamily(parentSku, parentSku, parentListing, [parentSku, ...siblings]);
    } else {
      const members = siblings.length ? siblings : [listing.sku];
      pushFamily(parentSku, parentSku, listing, members);
    }
  }

  // 3) Remaining listings are standalone.
  for (const listing of listings) {
    if (used.has(listing.sku) || used.has(normalizeSkuKey(listing.sku))) {
      continue;
    }
    pushFamily(listing.sku || listing.listingId, null, listing, [listing.sku]);
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
  /** Prefer rows already backfilled into public.amazon_listings. */
  preferDatabase?: boolean;
}): Promise<{
  families: AmazonListingFamily[];
  listings: AmazonListing[];
  fetchedAt: string;
  cached: boolean;
  marketplaceId: string;
  relationshipsLoaded: boolean;
  source: "database" | "live";
}> {
  const forceRefresh = options?.forceRefresh === true;
  const preferDatabase = options?.preferDatabase !== false && !forceRefresh;
  const includeRelationships = options?.includeRelationships !== false;

  if (preferDatabase) {
    try {
      const fromDb = await loadAmazonListingsFromDb();
      if (fromDb.listings.length > 0) {
        const parentMap = new Map<string, VariationMeta>();
        for (const listing of fromDb.listings) {
          parentMap.set(listing.sku, {
            parentSku: listing.parentSku,
            parentage: listing.parentage,
          });
          if (listing.parentage === "parent") {
            // child links are also on child rows; keep parent marker
          }
        }
        // Reconstruct child→parent from stored parent_sku.
        for (const listing of fromDb.listings) {
          if (listing.parentage === "child" && listing.parentSku) {
            parentMap.set(listing.sku, {
              parentSku: listing.parentSku,
              parentage: "child",
            });
            if (!parentMap.has(listing.parentSku)) {
              parentMap.set(listing.parentSku, {
                parentSku: null,
                parentage: "parent",
              });
            }
          }
        }

        const relationshipsLoaded = [...parentMap.values()].some(
          (meta) => meta.parentage === "parent" || meta.parentage === "child",
        );

        return {
          families: groupAmazonListings(fromDb.listings, parentMap),
          listings: fromDb.listings,
          fetchedAt: fromDb.fetchedAt || new Date().toISOString(),
          cached: true,
          marketplaceId: fromDb.marketplaceId,
          relationshipsLoaded,
          source: "database",
        };
      }
    } catch (error) {
      console.error(
        "[listAmazonListingFamilies] database read failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const fast = options?.fast !== false && !forceRefresh;
  const result = await fetchAmazonListings({ forceRefresh, fast });
  let parentMap = new Map<string, VariationMeta>();
  let imageBySku = new Map<string, string>();
  let relationshipsLoaded = false;
  const listingSkus = result.listings.map((listing) => listing.sku);

  try {
    const enriched = await fetchAmazonVariationParentMap(
      result.listings[0]?.sku,
      listingSkus,
    );
    imageBySku = enriched.imageBySku;
    if (includeRelationships) {
      parentMap = enriched.parentMap;
    }
  } catch {
    parentMap = new Map();
    imageBySku = new Map();
  }

  if (includeRelationships) {
    const linked = new Set(
      [...parentMap.entries()]
        .filter(
          ([, meta]) =>
            meta.parentage === "parent" || meta.parentage === "child",
        )
        .map(([sku]) => normalizeSkuKey(sku)),
    );
    const unlinked = listingSkus.filter(
      (sku) => sku && !linked.has(normalizeSkuKey(sku)),
    );
    if (unlinked.length > 1) {
      for (const [sku, meta] of inferFamiliesFromSkuPatterns([
        ...unlinked,
        ...[...parentMap.entries()]
          .filter(([, meta]) => meta.parentage === "parent")
          .map(([sku]) => sku),
      ])) {
        mergeVariationMeta(parentMap, sku, meta);
      }
    }

    relationshipsLoaded = [...parentMap.values()].some(
      (meta) => meta.parentage === "parent" || meta.parentage === "child",
    );
  }

  const listings = applyImagesToListings(result.listings, imageBySku);

  return {
    families: groupAmazonListings(listings, parentMap),
    listings,
    fetchedAt: result.fetchedAt,
    cached: result.cached,
    marketplaceId: result.marketplaceId,
    relationshipsLoaded,
    source: "live",
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
