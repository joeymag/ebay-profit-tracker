import { NextResponse } from "next/server";

import { syncEbayFeesFromFinancesApi } from "@/lib/ebay/sync-fees";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";
import {
  isShopifyApiSyncError,
  runOrderSync,
} from "@/lib/shopify/run-order-sync";
import { getShopifyConfig } from "@/lib/shopify/config";

export const maxDuration = 300;

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const config = getShopifyConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Shopify is not configured." },
      { status: 400 },
    );
  }

  try {
    const orderResult = await runOrderSync({
      mode: "quick",
      incremental: true,
    });

    let ebayFees: Awaited<ReturnType<typeof syncEbayFeesFromFinancesApi>> | null =
      null;

    const refreshToken = await getStoredEbayRefreshToken();
    if (refreshToken && orderResult.imported > 0) {
      try {
        ebayFees = await syncEbayFeesFromFinancesApi({ days: 30 });
      } catch {
        // Order sync succeeded; fee sync can retry on the next run.
      }
    }

    return NextResponse.json({
      ok: true,
      orders: orderResult,
      ebayFees,
    });
  } catch (error) {
    if (isShopifyApiSyncError(error)) {
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
      error instanceof Error ? error.message : "Auto-sync failed";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
