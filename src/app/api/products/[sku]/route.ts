import { NextResponse } from "next/server";

import { recalculateAllOrderProductCosts } from "@/lib/orders/apply-product-costs";
import { updateProductCost } from "@/lib/products/store";
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

  let body: { unitCost?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.unitCost !== null && body.unitCost !== undefined) {
    if (typeof body.unitCost !== "number" || !Number.isFinite(body.unitCost) || body.unitCost < 0) {
      return NextResponse.json(
        { ok: false, error: "unitCost must be a non-negative number or null." },
        { status: 400 },
      );
    }
  }

  try {
    const product = await updateProductCost(
      sku,
      body.unitCost === undefined ? null : body.unitCost,
    );
    const ordersUpdated = await recalculateAllOrderProductCosts();

    return NextResponse.json({
      ok: true,
      product,
      ordersUpdated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update product";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
