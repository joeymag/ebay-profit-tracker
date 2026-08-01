import { NextResponse } from "next/server";

import {
  deleteChildMapping,
  upsertChildMapping,
} from "@/lib/inventory/master-child";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is required for child SKU mappings." },
      { status: 400 },
    );
  }

  let body: {
    childSku?: string;
    masterSku?: string;
    piecesPerUnit?: number;
    label?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.childSku?.trim()) {
    return NextResponse.json(
      { ok: false, error: "childSku is required." },
      { status: 400 },
    );
  }
  if (!body.masterSku?.trim()) {
    return NextResponse.json(
      { ok: false, error: "masterSku is required." },
      { status: 400 },
    );
  }
  if (
    body.piecesPerUnit == null ||
    !Number.isFinite(body.piecesPerUnit) ||
    body.piecesPerUnit <= 0
  ) {
    return NextResponse.json(
      { ok: false, error: "piecesPerUnit must be a positive number." },
      { status: 400 },
    );
  }

  try {
    const mapping = await upsertChildMapping({
      childSku: body.childSku,
      masterSku: body.masterSku,
      piecesPerUnit: body.piecesPerUnit,
      label: body.label,
    });
    return NextResponse.json({ ok: true, mapping });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save child mapping.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is required for child SKU mappings." },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const childSku = searchParams.get("childSku")?.trim();
  if (!childSku) {
    return NextResponse.json(
      { ok: false, error: "childSku query parameter is required." },
      { status: 400 },
    );
  }

  try {
    await deleteChildMapping(childSku);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete child mapping.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
