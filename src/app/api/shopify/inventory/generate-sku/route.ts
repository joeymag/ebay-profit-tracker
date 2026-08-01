import { NextResponse } from "next/server";

import { suggestUniqueSku } from "@/lib/inventory/sku-uniqueness";
import {
  isShopifyInventoryError,
  setVariantSku,
} from "@/lib/shopify/inventory";

type GenerateSkuBody = {
  variantId?: number;
  prefix?: string;
};

export async function POST(request: Request) {
  let body: GenerateSkuBody;
  try {
    body = (await request.json()) as GenerateSkuBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const variantId = body.variantId;
  if (variantId == null || !Number.isFinite(variantId) || variantId <= 0) {
    return NextResponse.json(
      { ok: false, error: "variantId is required." },
      { status: 400 },
    );
  }

  const prefix = body.prefix?.trim() || "INV";

  try {
    const sku = await suggestUniqueSku(prefix);
    const assignedSku = await setVariantSku(Math.floor(variantId), sku);

    return NextResponse.json({
      ok: true,
      sku: assignedSku,
      variantId: Math.floor(variantId),
    });
  } catch (error) {
    const message = isShopifyInventoryError(error)
      ? error.message
      : "Could not generate SKU.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prefix = searchParams.get("prefix")?.trim() || "INV";

  try {
    const sku = await suggestUniqueSku(prefix);
    return NextResponse.json({ ok: true, sku });
  } catch (error) {
    const message = isShopifyInventoryError(error)
      ? error.message
      : "Could not generate SKU.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
