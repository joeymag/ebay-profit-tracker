import { after, NextResponse } from "next/server";

import {
  isShopifyApiSyncError,
  runOrderSync,
  type OrderSyncMode,
} from "@/lib/shopify/run-order-sync";
import { getShopifyConfig } from "@/lib/shopify/config";

/** Vercel Pro allows up to 300s; quick sync should finish well under that. */
export const maxDuration = 300;

function parseSyncMode(request: Request): OrderSyncMode {
  const url = new URL(request.url);
  return url.searchParams.get("mode") === "full" ? "full" : "quick";
}

export async function POST(request: Request) {
  const config = getShopifyConfig();
  const mode = parseSyncMode(request);

  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Shopify is not configured." },
      { status: 400 },
    );
  }

  // Full sync can exceed gateway timeouts — run in the background.
  if (mode === "full") {
    after(async () => {
      try {
        const result = await runOrderSync({
          mode: "full",
          incremental: false,
          skipRecalculateCosts: true,
        });
        console.info(
          "[shopify/orders/sync] full sync completed",
          JSON.stringify({
            imported: result.imported,
            postageLabelsFound: result.postageLabelsFound,
            trackingFound: result.trackingFound,
          }),
        );
      } catch (error) {
        console.error(
          "[shopify/orders/sync] full sync failed:",
          error instanceof Error ? error.message : error,
        );
      }
    });

    return NextResponse.json({
      ok: true,
      mode: "full",
      status: "started",
      imported: 0,
      total: 0,
      postageLabelsFound: 0,
      trackingFound: 0,
      syncedAt: null,
      hint: "Full sync started in the background (labels & images). Refresh the page in a few minutes.",
    });
  }

  try {
    // Quick sync: only orders changed since last sync (same as auto-sync).
    const result = await runOrderSync({
      mode: "quick",
      incremental: true,
      skipRecalculateCosts: true,
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      status: "completed",
      imported: result.imported,
      total: result.total,
      postageLabelsFound: result.postageLabelsFound,
      trackingFound: result.trackingFound,
      syncedAt: result.syncedAt,
      storage: result.storage,
      productsImported: result.productsImported,
      productsTotal: result.productsTotal,
      ordersWithCostsUpdated: result.ordersWithCostsUpdated,
      removedCancelled: result.removedCancelled,
      updatedSince: result.updatedSince,
      hint: result.hint,
    });
  } catch (error) {
    if (isShopifyApiSyncError(error)) {
      let hint: string | undefined;
      if (error.status === 403) {
        hint =
          "Add Admin API scope read_orders (not customer_read_orders). Release the app version, reinstall on your store, then sync again. If you created a new app, update SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env.local.";
      }

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          status: error.status,
          hint,
          details: error.body?.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to sync orders";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
