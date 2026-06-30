import { after, NextResponse } from "next/server";

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

async function runAutoSync(): Promise<void> {
  const orderResult = await runOrderSync({
    mode: "quick",
    incremental: true,
    skipRecalculateCosts: true,
  });

  const refreshToken = await getStoredEbayRefreshToken();
  if (refreshToken && orderResult.imported > 0) {
    try {
      await syncEbayFeesFromFinancesApi({ days: 30 });
    } catch (error) {
      console.error("[cron/sync-orders] eBay fee sync failed:", error);
    }
  }

  console.info(
    "[cron/sync-orders] completed",
    JSON.stringify({
      imported: orderResult.imported,
      updatedSince: orderResult.updatedSince,
    }),
  );
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

  after(async () => {
    try {
      await runAutoSync();
    } catch (error) {
      if (isShopifyApiSyncError(error)) {
        console.error("[cron/sync-orders] Shopify error:", error.message);
        return;
      }

      console.error(
        "[cron/sync-orders] failed:",
        error instanceof Error ? error.message : error,
      );
    }
  });

  return NextResponse.json({
    ok: true,
    status: "started",
    message:
      "Auto-sync started. cron-job.org only needs this quick response; sync continues on the server.",
  });
}
