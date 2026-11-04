import { NextResponse } from "next/server";

import { deleteStoredOrder } from "@/lib/orders/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const MAX_BULK_ORDERS = 50;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Bulk delete requires Supabase configuration." },
      { status: 400 },
    );
  }

  let body: { shopifyIds?: number[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.shopifyIds) || body.shopifyIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Select at least one order." },
      { status: 400 },
    );
  }

  if (body.shopifyIds.length > MAX_BULK_ORDERS) {
    return NextResponse.json(
      { ok: false, error: `You can delete at most ${MAX_BULK_ORDERS} orders at once.` },
      { status: 400 },
    );
  }

  const shopifyIds = [
    ...new Set(
      body.shopifyIds.filter((id) => typeof id === "number" && Number.isFinite(id)),
    ),
  ];

  if (shopifyIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Select at least one valid order." },
      { status: 400 },
    );
  }

  let deletedCount = 0;
  const failed: Array<{ shopifyId: number; error: string }> = [];

  for (const shopifyId of shopifyIds) {
    try {
      const removed = await deleteStoredOrder(shopifyId);
      if (removed) deletedCount += 1;
      else failed.push({ shopifyId, error: "Order not found." });
    } catch (error) {
      failed.push({
        shopifyId,
        error: error instanceof Error ? error.message : "Delete failed.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    deletedCount,
    failed: failed.slice(0, 10),
  });
}
