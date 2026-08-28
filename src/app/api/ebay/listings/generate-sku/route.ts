import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { generateListingSkusBulk } from "@/lib/ebay/generate-listing-sku";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 300;

type GenerateSkuBody = {
  listingIds?: string[];
  prefix?: string;
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

  let body: GenerateSkuBody;
  try {
    body = (await request.json()) as GenerateSkuBody;
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
      { ok: false, error: "Generate SKUs for at most 50 listings at a time." },
      { status: 400 },
    );
  }

  const prefix = body.prefix?.trim() || "EBAY";
  if (prefix.length > 20) {
    return NextResponse.json(
      { ok: false, error: "Prefix must be 20 characters or fewer." },
      { status: 400 },
    );
  }

  const results = await generateListingSkusBulk({ listingIds, prefix });
  const successCount = results.filter((result) => result.ok).length;

  return NextResponse.json({
    ok: true,
    successCount,
    failureCount: results.length - successCount,
    results,
  });
}
