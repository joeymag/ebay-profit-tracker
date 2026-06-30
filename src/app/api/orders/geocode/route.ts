import { NextResponse } from "next/server";

import { geocodePendingOrders } from "@/lib/geocoding/geocode";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 400 },
    );
  }

  try {
    const stats = await geocodePendingOrders();
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to geocode orders";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
