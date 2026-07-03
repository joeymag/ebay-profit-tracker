import { NextResponse } from "next/server";

import {
  isShopifyInventoryError,
  listOutOfStockItems,
} from "@/lib/shopify/inventory";

export const maxDuration = 60;

export async function GET() {
  try {
    const items = await listOutOfStockItems();
    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
    });
  } catch (error) {
    const message = isShopifyInventoryError(error)
      ? error.message
      : "Could not load out-of-stock items.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
