import { NextResponse } from "next/server";

import { getAmazonBalanceSummary } from "@/lib/amazon/balance";
import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export async function GET() {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Amazon is not configured." },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredAmazonRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONNECTED",
        error: "Amazon is not connected. Authorize in Settings first.",
      },
      { status: 400 },
    );
  }

  try {
    const summary = await getAmazonBalanceSummary();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    if (error instanceof AmazonApiError && error.status === 403) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Amazon blocked the balance request. In Seller Central, give this app the Finance and Accounting role, then reconnect Amazon in Settings.",
        },
        { status: 403 },
      );
    }
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.body.slice(0, 500) },
        { status: 502 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Could not load the Amazon balance.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
