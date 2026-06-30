import { NextResponse } from "next/server";

import { bulkUpdateOrderCosts } from "@/lib/orders/store";
import {
  hasAnyCostUpdate,
  validateCostUpdateBody,
  type CostUpdateBody,
} from "@/lib/orders/validate-cost-updates";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const MAX_BULK_ORDERS = 200;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Bulk edit requires Supabase configuration." },
      { status: 400 },
    );
  }

  let body: {
    shopifyIds?: number[];
  } & CostUpdateBody;

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
      { ok: false, error: `You can update at most ${MAX_BULK_ORDERS} orders at once.` },
      { status: 400 },
    );
  }

  const shopifyIds = body.shopifyIds.filter(
    (id) => typeof id === "number" && Number.isFinite(id),
  );

  if (shopifyIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid order ids provided." },
      { status: 400 },
    );
  }

  if (!hasAnyCostUpdate(body)) {
    return NextResponse.json(
      { ok: false, error: "Enter at least one cost or fee to apply." },
      { status: 400 },
    );
  }

  const validationError = validateCostUpdateBody(body);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  const updates: {
    ebayFeeRatePercent?: number;
    ebayAdsFeeRatePercent?: number;
    shippingLabelCost?: number;
    productCost?: number;
  } = {};

  if (
    body.ebayFeeRatePercent !== undefined &&
    body.ebayFeeRatePercent !== null
  ) {
    updates.ebayFeeRatePercent = body.ebayFeeRatePercent;
  }
  if (
    body.ebayAdsFeeRatePercent !== undefined &&
    body.ebayAdsFeeRatePercent !== null
  ) {
    updates.ebayAdsFeeRatePercent = body.ebayAdsFeeRatePercent;
  }
  if (body.shippingLabelCost !== undefined && body.shippingLabelCost !== null) {
    updates.shippingLabelCost = body.shippingLabelCost;
  }
  if (body.productCost !== undefined && body.productCost !== null) {
    updates.productCost = body.productCost;
  }

  try {
    const result = await bulkUpdateOrderCosts(shopifyIds, updates);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bulk update failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
