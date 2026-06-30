import { NextResponse } from "next/server";

import {
  isShopifyApiSyncError,
  runOrderSync,
  type OrderSyncMode,
} from "@/lib/shopify/run-order-sync";
import { getShopifyConfig } from "@/lib/shopify/config";

/** Vercel Pro allows up to 300s; full sync can still exceed Hobby limits. */
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

  try {
    const result = await runOrderSync({ mode, incremental: false });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
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
