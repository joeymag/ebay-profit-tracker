import { NextResponse } from "next/server";

import {
  isShopifyInventoryError,
  listInventoryMapItems,
} from "@/lib/shopify/inventory";

export const maxDuration = 60;

export async function GET() {
  try {
    const { items, summary } = await listInventoryMapItems();
    return NextResponse.json({
      ok: true,
      count: items.length,
      summary,
      items,
    });
  } catch (error) {
    const message = isShopifyInventoryError(error)
      ? error.message
      : "Could not load inventory map.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
