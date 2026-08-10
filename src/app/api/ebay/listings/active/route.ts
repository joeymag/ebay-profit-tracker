import { NextResponse } from "next/server";

import { fetchActiveEbayListings } from "@/lib/ebay/active-listings";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 300;

export async function GET() {
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

  try {
    const result = await fetchActiveEbayListings();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EbayApiError) {
      const needsReconnect =
        error.status === 403 &&
        (error.body?.includes("scope") ||
          error.body?.includes("Access denied") ||
          error.body?.includes("Insufficient"));

      return NextResponse.json(
        {
          ok: false,
          error: needsReconnect
            ? "eBay access not granted for listings. Reconnect eBay in Settings."
            : error.message,
          code: needsReconnect ? "SCOPE_REQUIRED" : "EBAY_API_ERROR",
          status: error.status,
          details: error.body?.slice(0, 500),
        },
        { status: needsReconnect ? 403 : 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to load eBay listings";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
