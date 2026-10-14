import { NextResponse } from "next/server";

import { loadMarketplacePayments } from "@/lib/accounting/payment-store";
import { listAmazonAccountPayments } from "@/lib/amazon/account-payments";
import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 60;

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const config = getAmazonConfig();

  try {
    const result = await loadMarketplacePayments({
      channel: "amazon",
      refresh,
      loadFresh: async () => {
        if (!config.isConfigured) throw new Error("Amazon is not configured.");
        if (!(await getStoredAmazonRefreshToken())) {
          throw new Error("Amazon is not connected. Authorize in Settings first.");
        }
        return { payments: await listAmazonAccountPayments(30), warning: null };
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof AmazonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load Amazon payments.";
    const status =
      error instanceof AmazonApiError && error.status === 403
        ? 403
        : /not connected|not configured/i.test(message)
          ? 400
          : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
