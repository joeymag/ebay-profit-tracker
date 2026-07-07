import { NextResponse } from "next/server";

import { getStoredOrdersForRange } from "@/lib/orders/filtered-orders";
import { buildOrdersCsv, ordersCsvFilename } from "@/lib/orders/orders-csv";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const { orders, range } = await getStoredOrdersForRange({
      range: searchParams.get("range") ?? undefined,
      channel: searchParams.get("channel") ?? undefined,
      product: searchParams.get("product") ?? undefined,
    });

    const csv = buildOrdersCsv(orders);
    const filename = ordersCsvFilename(range);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export orders.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
