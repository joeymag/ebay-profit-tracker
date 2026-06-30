import { NextResponse } from "next/server";

import { readOrdersFromJson } from "@/lib/orders/migrate";
import { getOrderCountFromSupabase, saveOrdersToSupabase } from "@/lib/orders/supabase-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and a Supabase API key to .env.local",
      },
      { status: 400 },
    );
  }

  try {
    const existing = await getOrderCountFromSupabase();
    const { orders, syncedAt } = await readOrdersFromJson();

    if (!orders.length) {
      return NextResponse.json(
        { ok: false, error: "No orders in data/orders.json to migrate." },
        { status: 404 },
      );
    }

    const withPostage = orders.filter(
      (o) => o.shippingLabelCost != null && o.shippingLabelCost > 0,
    ).length;
    const withTracking = orders.filter((o) => o.trackingNumbers.length > 0).length;

    await saveOrdersToSupabase(orders, syncedAt ?? new Date().toISOString(), {
      postageLabelsFound: withPostage,
      trackingFound: withTracking,
    });

    return NextResponse.json({
      ok: true,
      migrated: orders.length,
      previousDbCount: existing,
      message: `Imported ${orders.length} orders into Supabase.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Migration failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
