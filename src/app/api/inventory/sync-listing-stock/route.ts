import { NextResponse } from "next/server";

import { syncConfigListingStock } from "@/lib/inventory/sync-listing-stock";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isShopifyInventoryError } from "@/lib/shopify/inventory";

type SyncListingStockBody = {
  masterSkus?: string[];
  childSkus?: string[];
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is required for listing stock sync." },
      { status: 400 },
    );
  }

  let body: SyncListingStockBody;
  try {
    body = (await request.json()) as SyncListingStockBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const masterSkus = body.masterSkus ?? [];
  const childSkus = body.childSkus ?? [];

  if (masterSkus.length === 0 && childSkus.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Provide at least one master or child SKU." },
      { status: 400 },
    );
  }

  try {
    const results = await syncConfigListingStock({ masterSkus, childSkus });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = isShopifyInventoryError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : "Could not sync listing stock.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
