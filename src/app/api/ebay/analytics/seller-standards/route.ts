import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { ebayApiRouteErrorResponse } from "@/lib/ebay/route-response";
import { fetchEbaySellerStandardsSnapshot } from "@/lib/ebay/seller-standards";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 60;

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
    const snapshot = await fetchEbaySellerStandardsSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return ebayApiRouteErrorResponse(error, {
      scopeMessage:
        "Analytics access not granted. Reconnect eBay in Settings to add the analytics scope.",
      fallbackMessage: "Failed to load eBay seller standards.",
    });
  }
}
