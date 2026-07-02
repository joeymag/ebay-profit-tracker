import { NextResponse } from "next/server";

import {
  isShopifyInventoryError,
  updateStockQuantity,
} from "@/lib/shopify/inventory";

type SetStockBody = {
  sku?: string;
  available?: number;
  locationId?: number;
};

export async function POST(request: Request) {
  let body: SetStockBody;
  try {
    body = (await request.json()) as SetStockBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const sku = body.sku?.trim();
  if (!sku) {
    return NextResponse.json({ ok: false, error: "SKU is required." }, { status: 400 });
  }

  if (body.available == null || !Number.isFinite(body.available)) {
    return NextResponse.json(
      { ok: false, error: "available quantity is required." },
      { status: 400 },
    );
  }

  try {
    const result = await updateStockQuantity({
      sku,
      available: body.available,
      locationId: body.locationId,
    });

    return NextResponse.json({
      ok: true,
      item: result.lookup,
      locationId: result.locationId,
      available: result.available,
    });
  } catch (error) {
    const message = isShopifyInventoryError(error)
      ? error.message
      : "Could not update stock.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
