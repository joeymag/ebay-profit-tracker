import { gunzipSync } from "zlib";

import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AmazonListing = {
  listingId: string;
  sku: string;
  title: string;
  asin: string | null;
  price: number | null;
  quantity: number | null;
  imageUrl: string | null;
  openDate: string | null;
  fulfillmentChannel: string | null;
  condition: string | null;
  productUrl: string | null;
};

type CreateReportResponse = { reportId: string };
type GetReportResponse = {
  reportId: string;
  processingStatus: string;
  reportDocumentId?: string;
  createdTime?: string;
};
type GetReportsResponse = {
  reports?: GetReportResponse[];
};
type GetReportDocumentResponse = {
  reportDocumentId: string;
  url: string;
  compressionAlgorithm?: string;
};

type ListingsCache = {
  marketplaceId: string;
  listings: AmazonListing[];
  fetchedAt: number;
};

let memoryCache: ListingsCache | null = null;
const CACHE_TTL_MS = 30 * 60_000;
/** Serve stale cache up to this age to avoid Vercel 504s. */
const STALE_MAX_MS = 24 * 60 * 60_000;
/** Prefer a DONE report created within this window instead of making a new one. */
const REUSE_REPORT_MAX_MS = 6 * 60 * 60_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMoney(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseQty(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Amazon flat-file item-condition codes → label. */
function formatCondition(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const map: Record<string, string> = {
    "1": "Used - Like New",
    "2": "Used - Very Good",
    "3": "Used - Good",
    "4": "Used - Acceptable",
    "5": "Collectible - Like New",
    "6": "Collectible - Very Good",
    "7": "Collectible - Good",
    "8": "Collectible - Acceptable",
    "10": "Refurbished",
    "11": "New",
  };
  return map[raw] ?? raw;
}

function amazonImageFromAsin(asin: string | null): string | null {
  if (!asin) return null;
  return `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX200_.jpg`;
}

function parseTsv(text: string): AmazonListing[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0]!.split("\t").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);

  const iName = idx("item-name");
  const iListingId = idx("listing-id");
  const iSku = idx("seller-sku");
  const iPrice = idx("price");
  const iQty = idx("quantity");
  const iImage = idx("image-url");
  const iOpen = idx("open-date");
  const iAsin1 = idx("asin1");
  const iProductId = idx("product-id");
  const iFulfillment = idx("fulfillment-channel");
  const iCondition = idx("item-condition");

  const { marketplaceId } = getAmazonConfig();
  const domain =
    marketplaceId === "A1F83G8C2ARO7P"
      ? "www.amazon.co.uk"
      : marketplaceId === "A1PA6795UKMFR9"
        ? "www.amazon.de"
        : "www.amazon.co.uk";

  const listings: AmazonListing[] = [];
  for (let row = 1; row < lines.length; row += 1) {
    const cols = lines[row]!.split("\t");
    const asin =
      (iAsin1 >= 0 ? cols[iAsin1]?.trim() : "") ||
      (iProductId >= 0 ? cols[iProductId]?.trim() : "") ||
      null;
    const sku = (iSku >= 0 ? cols[iSku]?.trim() : "") || "";
    const listingId =
      (iListingId >= 0 ? cols[iListingId]?.trim() : "") || sku || `row-${row}`;
    const reportImage = (iImage >= 0 ? cols[iImage]?.trim() : "") || "";

    listings.push({
      listingId,
      sku,
      title: (iName >= 0 ? cols[iName]?.trim() : "") || sku || "Untitled",
      asin: asin || null,
      price: parseMoney(iPrice >= 0 ? cols[iPrice] : undefined),
      quantity: parseQty(iQty >= 0 ? cols[iQty] : undefined),
      imageUrl: reportImage || amazonImageFromAsin(asin),
      openDate: (iOpen >= 0 ? cols[iOpen]?.trim() : "") || null,
      fulfillmentChannel:
        (iFulfillment >= 0 ? cols[iFulfillment]?.trim() : "") || null,
      condition: formatCondition(iCondition >= 0 ? cols[iCondition] : undefined),
      productUrl: asin ? `https://${domain}/dp/${asin}` : null,
    });
  }

  return listings;
}

async function downloadReportDocument(documentId: string): Promise<string> {
  const doc = await amazonFetch<GetReportDocumentResponse>({
    path: `/reports/2021-06-30/documents/${documentId}`,
  });

  const fileRes = await fetch(doc.url);
  if (!fileRes.ok) {
    throw new AmazonApiError(
      `Failed to download Amazon listings report (${fileRes.status})`,
      fileRes.status,
      await fileRes.text().then((t) => t.slice(0, 300)),
    );
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (doc.compressionAlgorithm === "GZIP") {
    return gunzipSync(buffer).toString("utf8");
  }
  return buffer.toString("utf8");
}

async function readPersistedCache(
  marketplaceId: string,
): Promise<ListingsCache | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("amazon_listings_cache")
      .select("listings, fetched_at")
      .eq("marketplace_id", marketplaceId)
      .maybeSingle();
    if (error || !data) return null;
    const listings = Array.isArray(data.listings)
      ? (data.listings as AmazonListing[])
      : [];
    const fetchedAt = Date.parse(data.fetched_at);
    if (!Number.isFinite(fetchedAt) || listings.length === 0) return null;
    return { marketplaceId, listings, fetchedAt };
  } catch {
    return null;
  }
}

async function writePersistedCache(cache: ListingsCache): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createSupabaseAdmin();
    await supabase.from("amazon_listings_cache").upsert(
      {
        marketplace_id: cache.marketplaceId,
        listings: cache.listings,
        fetched_at: new Date(cache.fetchedAt).toISOString(),
      },
      { onConflict: "marketplace_id" },
    );
  } catch {
    // Cache write failures should not break listing loads.
  }
}

function cacheResult(cache: ListingsCache, cached: boolean) {
  memoryCache = cache;
  return {
    marketplaceId: cache.marketplaceId,
    listings: cache.listings,
    fetchedAt: new Date(cache.fetchedAt).toISOString(),
    cached,
  };
}

async function findRecentDoneReportDocumentId(
  marketplaceId: string,
): Promise<string | null> {
  try {
    const data = await amazonFetch<GetReportsResponse>({
      path: "/reports/2021-06-30/reports",
      query: {
        reportTypes: "GET_MERCHANT_LISTINGS_DATA",
        processingStatuses: "DONE",
        marketplaceIds: marketplaceId,
        pageSize: "10",
      },
    });
    const cutoff = Date.now() - REUSE_REPORT_MAX_MS;
    const candidates = (data.reports ?? [])
      .filter((r) => r.reportDocumentId)
      .filter((r) => {
        if (!r.createdTime) return true;
        const created = Date.parse(r.createdTime);
        return Number.isFinite(created) ? created >= cutoff : true;
      });
    return candidates[0]?.reportDocumentId ?? null;
  } catch {
    return null;
  }
}

async function buildListingsFromDocument(
  marketplaceId: string,
  documentId: string,
): Promise<ListingsCache> {
  const tsv = await downloadReportDocument(documentId);
  const listings = parseTsv(tsv).sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
  const cache: ListingsCache = {
    marketplaceId,
    listings,
    fetchedAt: Date.now(),
  };
  await writePersistedCache(cache);
  return cache;
}

async function createAndWaitForReport(
  marketplaceId: string,
  maxWaitMs: number,
): Promise<ListingsCache> {
  const created = await amazonFetch<CreateReportResponse>({
    method: "POST",
    path: "/reports/2021-06-30/reports",
    body: {
      reportType: "GET_MERCHANT_LISTINGS_DATA",
      marketplaceIds: [marketplaceId],
    },
  });

  const started = Date.now();
  let documentId: string | undefined;
  let attempt = 0;
  while (Date.now() - started < maxWaitMs) {
    await sleep(attempt === 0 ? 1500 : 2500);
    attempt += 1;
    const status = await amazonFetch<GetReportResponse>({
      path: `/reports/2021-06-30/reports/${created.reportId}`,
    });

    if (status.processingStatus === "DONE") {
      documentId = status.reportDocumentId;
      break;
    }
    if (
      status.processingStatus === "CANCELLED" ||
      status.processingStatus === "FATAL"
    ) {
      throw new Error(
        `Amazon listings report failed (${status.processingStatus}).`,
      );
    }
  }

  if (!documentId) {
    throw new Error(
      "Amazon listings report is still generating. Open Amazon listings once to warm the cache, then retry Repricer.",
    );
  }

  return buildListingsFromDocument(marketplaceId, documentId);
}

/**
 * Pull open/active merchant listings for the configured marketplace via
 * GET_MERCHANT_LISTINGS_DATA (Reports API). Uses memory + Supabase cache and
 * reuses recent DONE reports so Vercel requests stay under gateway timeouts.
 */
export async function fetchAmazonListings(options?: {
  forceRefresh?: boolean;
  /** Prefer cache / existing report; never wait long for a new report. */
  fast?: boolean;
}): Promise<{
  marketplaceId: string;
  listings: AmazonListing[];
  fetchedAt: string;
  cached: boolean;
}> {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    throw new Error(
      "Missing Amazon credentials. Add AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET.",
    );
  }

  const refreshToken = await getStoredAmazonRefreshToken();
  if (!refreshToken) {
    throw new Error(
      "Amazon is not connected. Paste a refresh token in Settings → Amazon SP-API.",
    );
  }

  const now = Date.now();
  const forceRefresh = options?.forceRefresh === true;
  const fast = options?.fast === true;

  if (
    !forceRefresh &&
    memoryCache &&
    memoryCache.marketplaceId === config.marketplaceId &&
    now - memoryCache.fetchedAt < CACHE_TTL_MS
  ) {
    return cacheResult(memoryCache, true);
  }

  if (!forceRefresh) {
    const persisted = await readPersistedCache(config.marketplaceId);
    if (persisted) {
      memoryCache = persisted;
      const age = now - persisted.fetchedAt;
      if (age < CACHE_TTL_MS || (fast && age < STALE_MAX_MS)) {
        return cacheResult(persisted, true);
      }
      // Freshness expired but keep as fallback if refresh fails / times out.
      if (!fast && age < STALE_MAX_MS) {
        // Fall through to refresh, but we'll return stale on timeout.
      } else if (fast) {
        return cacheResult(persisted, true);
      }
    }
  }

  // Fast path: download a recent DONE report (no create + poll).
  const existingDocId = await findRecentDoneReportDocumentId(
    config.marketplaceId,
  );
  if (existingDocId) {
    try {
      const cache = await buildListingsFromDocument(
        config.marketplaceId,
        existingDocId,
      );
      return cacheResult(cache, false);
    } catch {
      // Fall through.
    }
  }

  if (fast) {
    const stale =
      memoryCache?.marketplaceId === config.marketplaceId
        ? memoryCache
        : await readPersistedCache(config.marketplaceId);
    if (stale && now - stale.fetchedAt < STALE_MAX_MS) {
      return cacheResult(stale, true);
    }
    throw new Error(
      "Amazon listings cache is empty. Open Amazon listings once to build it (takes ~1–2 min), then return here.",
    );
  }

  const maxWaitMs = 90_000;
  try {
    const cache = await createAndWaitForReport(config.marketplaceId, maxWaitMs);
    return cacheResult(cache, false);
  } catch (error) {
    const stale =
      memoryCache?.marketplaceId === config.marketplaceId
        ? memoryCache
        : await readPersistedCache(config.marketplaceId);
    if (stale && now - stale.fetchedAt < STALE_MAX_MS) {
      return cacheResult(stale, true);
    }
    throw error;
  }
}
