import { gunzipSync } from "zlib";

import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

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

let listingsCache: ListingsCache | null = null;
const CACHE_TTL_MS = 10 * 60_000;

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

    listings.push({
      listingId,
      sku,
      title: (iName >= 0 ? cols[iName]?.trim() : "") || sku || "Untitled",
      asin: asin || null,
      price: parseMoney(iPrice >= 0 ? cols[iPrice] : undefined),
      quantity: parseQty(iQty >= 0 ? cols[iQty] : undefined),
      imageUrl: (iImage >= 0 ? cols[iImage]?.trim() : "") || null,
      openDate: (iOpen >= 0 ? cols[iOpen]?.trim() : "") || null,
      fulfillmentChannel:
        (iFulfillment >= 0 ? cols[iFulfillment]?.trim() : "") || null,
      condition: (iCondition >= 0 ? cols[iCondition]?.trim() : "") || null,
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

/**
 * Pull open/active merchant listings for the configured marketplace via
 * GET_MERCHANT_LISTINGS_DATA (Reports API). Cached briefly to avoid
 * re-running a slow report on every page refresh.
 */
export async function fetchAmazonListings(options?: {
  forceRefresh?: boolean;
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
  if (
    !options?.forceRefresh &&
    listingsCache &&
    listingsCache.marketplaceId === config.marketplaceId &&
    now - listingsCache.fetchedAt < CACHE_TTL_MS
  ) {
    return {
      marketplaceId: listingsCache.marketplaceId,
      listings: listingsCache.listings,
      fetchedAt: new Date(listingsCache.fetchedAt).toISOString(),
      cached: true,
    };
  }

  const created = await amazonFetch<CreateReportResponse>({
    method: "POST",
    path: "/reports/2021-06-30/reports",
    body: {
      reportType: "GET_MERCHANT_LISTINGS_DATA",
      marketplaceIds: [config.marketplaceId],
    },
  });

  let documentId: string | undefined;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(attempt === 0 ? 2000 : 3000);
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
    throw new Error("Timed out waiting for Amazon listings report.");
  }

  const tsv = await downloadReportDocument(documentId);
  const listings = parseTsv(tsv).sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );

  listingsCache = {
    marketplaceId: config.marketplaceId,
    listings,
    fetchedAt: now,
  };

  return {
    marketplaceId: config.marketplaceId,
    listings,
    fetchedAt: new Date(now).toISOString(),
    cached: false,
  };
}
