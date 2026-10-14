import { NextResponse } from "next/server";

import { loadMarketplacePayments } from "@/lib/accounting/payment-store";
import { listEbayAccountPayments } from "@/lib/ebay/account-payments";
import { EbayApiError } from "@/lib/ebay/client";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbaySigningKeyMissingError } from "@/lib/ebay/digital-signature";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 60;

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const config = getEbayConfig();

  try {
    const result = await loadMarketplacePayments({
      channel: "ebay",
      refresh,
      loadFresh: async () => {
        if (!config.isConfigured) throw new Error("eBay is not configured.");
        if (!(await getStoredEbayRefreshToken())) {
          throw new Error("eBay is not connected. Authorize in Settings first.");
        }
        return { payments: await listEbayAccountPayments(30), warning: null };
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EbaySigningKeyMissingError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const message =
      error instanceof EbayApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load eBay payments.";
    const status = /not connected|not configured/i.test(message) ? 400 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
