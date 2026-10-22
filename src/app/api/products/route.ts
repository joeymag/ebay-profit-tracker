import { NextResponse } from "next/server";

import { recalculateAllOrderProductCosts } from "@/lib/orders/apply-product-costs";
import {
  getProducts,
  linkTemuProducts,
  syncProductsFromShopify,
} from "@/lib/products/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Products require Supabase configuration." },
      { status: 400 },
    );
  }

  try {
    const products = await getProducts();
    const withCost = products.filter((p) => p.unitCost != null).length;
    return NextResponse.json({
      ok: true,
      products,
      total: products.length,
      withCost,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load products";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Products require Supabase configuration." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };

  if (body.action === "link-temu") {
    try {
      const result = await linkTemuProducts();
      const ordersUpdated = await recalculateAllOrderProductCosts();
      const linked = result.linkedFromOrders + result.linkedFromTemuApi;
      return NextResponse.json({
        ok: true,
        ...result,
        ordersUpdated,
        message: result.skipped
          ? result.skipReason || "Temu link skipped."
          : `Linked ${linked} Temu SKU(s) to products` +
            (result.temuGoodsSkus
              ? ` (Temu catalog ${result.temuGoodsSkus} SKUs)`
              : "") +
            `. ${result.alreadyLinked} products now have a Temu SKU.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to link Temu products";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  if (body.action !== "sync-from-shopify") {
    return NextResponse.json(
      {
        ok: false,
        error: 'Use action "sync-from-shopify" or "link-temu".',
      },
      { status: 400 },
    );
  }

  try {
    const result = await syncProductsFromShopify();
    const ordersUpdated = await recalculateAllOrderProductCosts();
    const parts = [
      result.imported
        ? `${result.imported} new`
        : null,
      result.updated
        ? `${result.updated} updated`
        : null,
      result.removed
        ? `${result.removed} removed`
        : null,
    ].filter(Boolean);

    return NextResponse.json({
      ok: true,
      ...result,
      ordersUpdated,
      message: `${parts.join(", ") || "Catalog up to date"}. ${result.total} Shopify products in catalog.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync products";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
