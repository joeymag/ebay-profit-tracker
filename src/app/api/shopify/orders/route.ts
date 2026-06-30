import { NextResponse } from "next/server";

import { getStoredOrders } from "@/lib/orders/store";

export async function GET() {
  const database = await getStoredOrders();
  return NextResponse.json({
    ok: true,
    syncedAt: database.syncedAt,
    count: database.orders.length,
    orders: database.orders,
  });
}
