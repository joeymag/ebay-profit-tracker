import { NextResponse } from "next/server";

import { recalculateAllOrderProductCosts } from "@/lib/orders/apply-product-costs";
import { upsertSkuCosts } from "@/lib/products/listing-costs";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type RouteContext = {
  params: Promise<{ sku: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Products require Supabase configuration." },
      { status: 400 },
    );
  }

  const { sku: encodedSku } = await context.params;
  const sku = decodeURIComponent(encodedSku);

  let body: {
    unitCost?: number | null;
    defaultPostage?: number | null;
    title?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.unitCost === undefined &&
    body.defaultPostage === undefined
  ) {
    return NextResponse.json(
      { ok: false, error: "Provide unitCost and/or defaultPostage." },
      { status: 400 },
    );
  }

  if (body.unitCost !== null && body.unitCost !== undefined) {
    if (typeof body.unitCost !== "number" || !Number.isFinite(body.unitCost) || body.unitCost < 0) {
      return NextResponse.json(
        { ok: false, error: "unitCost must be a non-negative number or null." },
        { status: 400 },
      );
    }
  }

  if (body.defaultPostage !== null && body.defaultPostage !== undefined) {
    if (
      typeof body.defaultPostage !== "number" ||
      !Number.isFinite(body.defaultPostage) ||
      body.defaultPostage < 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "defaultPostage must be a non-negative number or null.",
        },
        { status: 400 },
      );
    }
  }

  try {
    const costs = await upsertSkuCosts({
      sku,
      title: body.title,
      unitCost: body.unitCost,
      defaultPostage: body.defaultPostage,
    });

    const ordersUpdated =
      body.unitCost !== undefined
        ? await recalculateAllOrderProductCosts()
        : 0;

    return NextResponse.json({
      ok: true,
      costs,
      ordersUpdated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update product";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
