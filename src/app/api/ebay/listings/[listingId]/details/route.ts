import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import { fetchEbayListingDetails } from "@/lib/ebay/listing-details";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { listingId } = await context.params;
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

  if (!listingId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID is required." },
      { status: 400 },
    );
  }

  try {
    const listing = await fetchEbayListingDetails(listingId);
    return NextResponse.json({ ok: true, listing });
  } catch (error) {
    if (error instanceof EbayApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          code: "EBAY_API_ERROR",
          status: error.status,
          details: error.body?.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to load listing details";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
