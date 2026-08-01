import { NextResponse } from "next/server";

import {
  deleteInventoryMaster,
  syncMasterPiecesFromShopify,
} from "@/lib/inventory/master-child";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type RouteContext = {
  params: Promise<{ sku: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is required for inventory masters." },
      { status: 400 },
    );
  }

  const { sku: encodedSku } = await context.params;
  const sku = decodeURIComponent(encodedSku);

  try {
    const master = await syncMasterPiecesFromShopify(sku);
    return NextResponse.json({ ok: true, master });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not sync master stock.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is required for inventory masters." },
      { status: 400 },
    );
  }

  const { sku: encodedSku } = await context.params;
  const sku = decodeURIComponent(encodedSku);

  try {
    await deleteInventoryMaster(sku);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete inventory master.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
