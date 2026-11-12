import { getAmazonConfig } from "@/lib/amazon/config";
import type {
  AmazonListingContent,
  AmazonListingFamily,
  AmazonListingFamilyMember,
  AmazonListingImage,
} from "@/lib/amazon/listing-editor";
import type { AmazonListing } from "@/lib/amazon/listings";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Database, Json } from "@/lib/supabase/database.types";

export type AmazonListingRow =
  Database["public"]["Tables"]["amazon_listings"]["Row"];
export type AmazonListingInsert =
  Database["public"]["Tables"]["amazon_listings"]["Insert"];

const UPSERT_BATCH = 100;

function asStringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function imageUrlsFromContent(
  content: Pick<AmazonListingContent, "images">,
): string[] {
  const urls = content.images.map((image) => image.url.trim()).filter(Boolean);
  return urls;
}

export function imagesFromUrls(urls: string[] | null | undefined): AmazonListingImage[] {
  const list = asStringArray(urls);
  return list.map((url, index) => ({
    role: index === 0 ? ("main" as const) : (`other_${index}` as const),
    url,
  }));
}

export function rowToAmazonListing(row: AmazonListingRow): AmazonListing {
  return {
    listingId: row.listing_id || row.sku,
    sku: row.sku,
    title: row.title || row.sku,
    asin: row.asin,
    price: row.price,
    quantity: row.quantity,
    imageUrl: asStringArray(row.image_urls)[0] ?? null,
    openDate: null,
    fulfillmentChannel: row.fulfillment_channel,
    condition: row.condition,
    productUrl: row.product_url,
  };
}

export function rowToAmazonListingContent(row: AmazonListingRow): AmazonListingContent {
  const bullets = asStringArray(row.bullet_points);
  while (bullets.length < 5) bullets.push("");
  return {
    sku: row.sku,
    asin: row.asin,
    productType: row.product_type?.trim() || "PRODUCT",
    title: row.title || row.sku,
    description: row.description || "",
    bulletPoints: bullets.slice(0, 5),
    genericKeywords: row.generic_keywords || "",
    images: imagesFromUrls(row.image_urls),
    parentSku: row.parent_sku,
    childSkus: asStringArray(row.child_skus),
    parentage:
      row.parentage === "parent" || row.parentage === "child"
        ? row.parentage
        : "standalone",
    status: row.status,
  };
}

export function rowToFamilyMember(row: AmazonListingRow): AmazonListingFamilyMember {
  return {
    ...rowToAmazonListing(row),
    parentSku: row.parent_sku,
    parentage:
      row.parentage === "parent" || row.parentage === "child"
        ? row.parentage
        : "standalone",
  };
}

export async function listStoredAmazonListings(options?: {
  marketplaceId?: string;
}): Promise<AmazonListingRow[]> {
  if (!isSupabaseConfigured()) return [];
  const marketplaceId =
    options?.marketplaceId || getAmazonConfig().marketplaceId;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("amazon_listings")
    .select("*")
    .eq("marketplace_id", marketplaceId)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStoredAmazonListing(
  sku: string,
  options?: { marketplaceId?: string },
): Promise<AmazonListingRow | null> {
  if (!isSupabaseConfigured() || !sku.trim()) return null;
  const marketplaceId =
    options?.marketplaceId || getAmazonConfig().marketplaceId;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("amazon_listings")
    .select("*")
    .eq("marketplace_id", marketplaceId)
    .eq("sku", sku.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getStoredAmazonListingFamily(
  sku: string,
  options?: { marketplaceId?: string },
): Promise<{
  content: AmazonListingContent | null;
  family: AmazonListingContent[];
  familySkus: string[];
  rows: AmazonListingRow[];
}> {
  const primary = await getStoredAmazonListing(sku, options);
  if (!primary) {
    return { content: null, family: [], familySkus: [], rows: [] };
  }

  const marketplaceId = primary.marketplace_id;
  const supabase = createSupabaseAdmin();
  const parentSku =
    primary.parentage === "parent"
      ? primary.sku
      : primary.parent_sku || primary.sku;

  const { data, error } = await supabase
    .from("amazon_listings")
    .select("*")
    .eq("marketplace_id", marketplaceId)
    .or(
      [
        `sku.eq.${parentSku}`,
        `parent_sku.eq.${parentSku}`,
        `sku.eq.${primary.sku}`,
      ].join(","),
    );
  if (error) throw new Error(error.message);

  const rows = data ?? [primary];
  const bySku = new Map(rows.map((row) => [row.sku, row]));
  if (!bySku.has(primary.sku)) bySku.set(primary.sku, primary);

  // Prefer explicit child_skus from parent when available.
  const parentRow =
    bySku.get(parentSku) ??
    [...bySku.values()].find((row) => row.parentage === "parent") ??
    primary;
  const familySkus = new Set<string>([primary.sku, parentRow.sku]);
  for (const child of asStringArray(parentRow.child_skus)) familySkus.add(child);
  for (const row of bySku.values()) {
    if (
      row.parent_sku === parentRow.sku ||
      row.sku === parentRow.sku ||
      asStringArray(parentRow.child_skus).includes(row.sku)
    ) {
      familySkus.add(row.sku);
    }
  }

  const ordered = [...familySkus]
    .map((familySku) => bySku.get(familySku))
    .filter((row): row is AmazonListingRow => Boolean(row));

  const family = ordered.map(rowToAmazonListingContent);
  const content =
    family.find((member) => member.sku === primary.sku) ??
    rowToAmazonListingContent(primary);

  return {
    content,
    family,
    familySkus: ordered.map((row) => row.sku),
    rows: ordered,
  };
}

export function groupStoredAmazonListings(
  rows: AmazonListingRow[],
): AmazonListingFamily[] {
  const used = new Set<string>();
  const families: AmazonListingFamily[] = [];
  const bySku = new Map(rows.map((row) => [row.sku, row]));

  const push = (memberRows: AmazonListingRow[], parentSku: string | null) => {
    if (!memberRows.length) return;
    const members = memberRows.map(rowToFamilyMember);
    for (const member of members) used.add(member.sku);
    const anchor = memberRows[0]!;
    families.push({
      groupId: parentSku || anchor.sku,
      parentSku,
      title: anchor.title || anchor.sku,
      imageUrl: asStringArray(anchor.image_urls)[0] ?? null,
      members,
    });
  };

  for (const row of rows) {
    if (used.has(row.sku)) continue;
    if (row.parentage === "parent") {
      const children = rows.filter(
        (candidate) =>
          candidate.parent_sku === row.sku ||
          asStringArray(row.child_skus).includes(candidate.sku),
      );
      push([row, ...children.filter((child) => child.sku !== row.sku)], row.sku);
      continue;
    }
    if (row.parentage === "child" && row.parent_sku) {
      if (used.has(row.parent_sku)) continue;
      const parent = bySku.get(row.parent_sku);
      const siblings = rows.filter(
        (candidate) =>
          candidate.parent_sku === row.parent_sku ||
          candidate.sku === row.parent_sku,
      );
      if (parent) {
        push(
          [
            parent,
            ...siblings.filter((member) => member.sku !== parent.sku),
          ],
          parent.sku,
        );
      } else {
        push(siblings.length ? siblings : [row], row.parent_sku);
      }
      continue;
    }
    push([row], null);
  }

  return families.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

export async function upsertAmazonListingRows(
  rows: AmazonListingInsert[],
): Promise<number> {
  if (!isSupabaseConfigured() || rows.length === 0) return 0;
  const supabase = createSupabaseAdmin();
  let saved = 0;
  for (let index = 0; index < rows.length; index += UPSERT_BATCH) {
    const batch = rows.slice(index, index + UPSERT_BATCH);
    const { error } = await supabase.from("amazon_listings").upsert(batch, {
      onConflict: "sku",
    });
    if (error) throw new Error(error.message);
    saved += batch.length;
  }
  return saved;
}

export function listingContentToUpsert(
  content: AmazonListingContent,
  extras?: Partial<AmazonListingInsert>,
): AmazonListingInsert {
  const { marketplaceId } = getAmazonConfig();
  const now = new Date().toISOString();
  const imageUrls =
    asStringArray(extras?.image_urls).length > 0
      ? asStringArray(extras?.image_urls)
      : imageUrlsFromContent(content);
  return {
    sku: content.sku,
    marketplace_id: extras?.marketplace_id || marketplaceId,
    asin: content.asin,
    listing_id: extras?.listing_id ?? content.sku,
    parent_sku: content.parentSku,
    parentage: content.parentage,
    child_skus: content.childSkus,
    product_type: content.productType,
    title: content.title,
    description: content.description,
    bullet_points: content.bulletPoints,
    generic_keywords: content.genericKeywords,
    image_urls: imageUrls,
    price: extras?.price ?? null,
    quantity: extras?.quantity ?? null,
    fulfillment_channel: extras?.fulfillment_channel ?? null,
    condition: extras?.condition ?? null,
    status: content.status,
    product_url: extras?.product_url ?? null,
    raw_attributes: (extras?.raw_attributes as Json) ?? {},
    updated_at: now,
    synced_at: now,
  };
}

export async function applyLocalListingContentUpdate(
  sku: string,
  update: {
    title?: string;
    description?: string;
    bulletPoints?: string[];
    genericKeywords?: string;
    imageUrls?: string[];
    status?: string | null;
  },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const existing = await getStoredAmazonListing(sku);
  if (!existing) return;
  const now = new Date().toISOString();
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("amazon_listings")
    .update({
      title: update.title ?? existing.title,
      description: update.description ?? existing.description,
      bullet_points: update.bulletPoints ?? existing.bullet_points,
      generic_keywords: update.genericKeywords ?? existing.generic_keywords,
      image_urls: update.imageUrls ?? existing.image_urls,
      status: update.status ?? existing.status,
      updated_at: now,
      synced_at: now,
    })
    .eq("sku", sku);
  if (error) throw new Error(error.message);
}

export async function amazonListingsCacheCount(
  marketplaceId?: string,
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const marketplace =
    marketplaceId || getAmazonConfig().marketplaceId;
  const supabase = createSupabaseAdmin();
  const { count, error } = await supabase
    .from("amazon_listings")
    .select("sku", { count: "exact", head: true })
    .eq("marketplace_id", marketplace);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
