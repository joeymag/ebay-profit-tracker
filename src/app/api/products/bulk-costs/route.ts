import { NextResponse } from "next/server";

import { recalculateAllOrderProductCosts } from "@/lib/orders/apply-product-costs";
import { upsertSkuCosts } from "@/lib/products/listing-costs";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const MAX_ITEMS = 200;

type BulkCostItem = {
  sku: string;
  title?: string | null;
  unitCost?: number | null;
  defaultPostage?: number | null;
};

type BulkCostResult = {
  sku: string;
  ok: boolean;
  costs?: { unitCost: number | null; defaultPostage: number | null };
  error?: string;
};

function validateMoneyField(
  value: unknown,
  field: "unitCost" | "defaultPostage",
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return `${field} must be a non-negative number or null.`;
  }

  return null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Products require Supabase configuration." },
      { status: 400 },
    );
  }

  let body: { items?: BulkCostItem[]; skipOrderRecalc?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return NextResponse.json(
      { ok: false, error: "Provide at least one item." },
      { status: 400 },
    );
  }

  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { ok: false, error: `You can update at most ${MAX_ITEMS} SKUs at once.` },
      { status: 400 },
    );
  }

  for (const item of items) {
    const unitCostError = validateMoneyField(item.unitCost, "unitCost");
    if (unitCostError) {
      return NextResponse.json({ ok: false, error: unitCostError }, { status: 400 });
    }

    const postageError = validateMoneyField(item.defaultPostage, "defaultPostage");
    if (postageError) {
      return NextResponse.json({ ok: false, error: postageError }, { status: 400 });
    }

    if (
      item.unitCost === undefined &&
      item.defaultPostage === undefined &&
      item.title === undefined
    ) {
      return NextResponse.json(
        { ok: false, error: "Each item needs unitCost, defaultPostage, and/or title." },
        { status: 400 },
      );
    }
  }

  const results: BulkCostResult[] = [];
  let anyUnitCostChanged = false;

  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku) {
      results.push({ sku: item.sku ?? "", ok: false, error: "SKU is required." });
      continue;
    }

    try {
      const costs = await upsertSkuCosts({
        sku,
        title: item.title,
        unitCost: item.unitCost,
        defaultPostage: item.defaultPostage,
      });
      if (item.unitCost !== undefined) {
        anyUnitCostChanged = true;
      }
      results.push({ sku, ok: true, costs });
    } catch (error) {
      results.push({
        sku,
        ok: false,
        error: error instanceof Error ? error.message : "Could not save costs.",
      });
    }
  }

  const successCount = results.filter((result) => result.ok).length;
  let ordersUpdated = 0;
  let ordersRecalcWarning: string | null = null;

  if (anyUnitCostChanged && !body.skipOrderRecalc) {
    try {
      ordersUpdated = await recalculateAllOrderProductCosts();
    } catch (recalcError) {
      ordersRecalcWarning =
        recalcError instanceof Error
          ? recalcError.message
          : "Order profit recalculation failed.";
    }
  }

  return NextResponse.json({
    ok: successCount > 0,
    successCount,
    failureCount: results.length - successCount,
    results,
    ordersUpdated,
    ordersRecalcWarning,
  });
}
