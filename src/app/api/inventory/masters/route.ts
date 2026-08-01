import { NextResponse } from "next/server";

import {
  listInventoryMasters,
  syncMasterPiecesFromShopify,
  upsertInventoryMaster,
} from "@/lib/inventory/master-child";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is required for inventory masters." },
      { status: 400 },
    );
  }

  try {
    const masters = await listInventoryMasters();
    return NextResponse.json({ ok: true, masters });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load inventory masters.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is required for inventory masters." },
      { status: 400 },
    );
  }

  let body: {
    sku?: string;
    packSize?: number;
    label?: string | null;
    syncFromShopify?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sku?.trim()) {
    return NextResponse.json({ ok: false, error: "sku is required." }, { status: 400 });
  }
  if (body.packSize == null || !Number.isFinite(body.packSize) || body.packSize <= 0) {
    return NextResponse.json(
      { ok: false, error: "packSize must be a positive number." },
      { status: 400 },
    );
  }

  try {
    const master = await upsertInventoryMaster({
      sku: body.sku,
      packSize: body.packSize,
      label: body.label,
    });

    const synced = body.syncFromShopify
      ? await syncMasterPiecesFromShopify(master.sku)
      : master;

    return NextResponse.json({ ok: true, master: synced });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save inventory master.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
