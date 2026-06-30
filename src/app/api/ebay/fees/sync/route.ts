import { NextResponse } from "next/server";

import { EbayApiError } from "@/lib/ebay/client";
import { EbaySigningKeyMissingError } from "@/lib/ebay/digital-signature";
import { getEbayConfig } from "@/lib/ebay/config";
import { syncEbayFeesFromFinancesApi } from "@/lib/ebay/sync-fees";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 300;

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
      },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? Number.parseInt(daysParam, 10) : undefined;

  try {
    const result = await syncEbayFeesFromFinancesApi({ days });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EbaySigningKeyMissingError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (error instanceof EbayApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          status: error.status,
          details: error.body?.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to sync eBay fees";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
