import { NextResponse } from "next/server";

import { EbayApiError } from "@/lib/ebay/client";
import { getEbayConfig } from "@/lib/ebay/config";
import { fetchListingTrafficReport } from "@/lib/ebay/traffic-report";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? undefined;

  try {
    const report = await fetchListingTrafficReport({ range });
    return NextResponse.json({ ok: true, report });
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
            ? "Analytics access not granted. Reconnect eBay in Settings to add the analytics scope."
            : error.message,
          code: needsReconnect ? "SCOPE_REQUIRED" : "EBAY_API_ERROR",
          status: error.status,
          details: error.body?.slice(0, 500),
        },
        { status: needsReconnect ? 403 : 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to load eBay analytics";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
