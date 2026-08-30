import { NextResponse } from "next/server";

import { bulkUpdateListingPrices } from "@/lib/ebay/bulk-price-update";
import { getEbayConfig } from "@/lib/ebay/config";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 300;

type BulkPriceBody = {
  listingIds?: string[];
  percentChange?: number;
};

export async function POST(request: Request) {
  const config = getEbayConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "eBay is not configured." },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredEbayRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "eBay is not connected. Authorize in Settings first.",
        code: "NOT_CONNECTED",
      },
      { status: 400 },
    );
  }

  let body: BulkPriceBody;
  try {
    body = (await request.json()) as BulkPriceBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const listingIds = Array.isArray(body.listingIds)
    ? [...new Set(body.listingIds.map((id) => id.trim()).filter(Boolean))]
    : [];

  if (!listingIds.length) {
    return NextResponse.json(
      { ok: false, error: "Provide at least one listingId." },
      { status: 400 },
    );
  }

  if (listingIds.length > 50) {
    return NextResponse.json(
      { ok: false, error: "Update prices for at most 50 listings at a time." },
      { status: 400 },
    );
  }

  const percentChange = body.percentChange;
  if (
    percentChange == null ||
    !Number.isFinite(percentChange) ||
    percentChange <= -100 ||
    percentChange > 1000
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "percentChange must be a number greater than -100 and at most 1000.",
      },
      { status: 400 },
    );
  }

  const results = await bulkUpdateListingPrices({ listingIds, percentChange });
  const successCount = results.filter((result) => result.ok).length;
  const variationCount = results.reduce(
    (sum, result) => sum + (result.variationCount ?? 0),
    0,
  );

  return NextResponse.json({
    ok: successCount > 0,
    successCount,
    failureCount: results.length - successCount,
    variationCount,
    percentChange,
    results,
  });
}
