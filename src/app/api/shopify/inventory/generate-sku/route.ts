import { NextResponse } from "next/server";

import { isSkuTaken, suggestUniqueSku } from "@/lib/inventory/sku-uniqueness";
import {
  isShopifyInventoryError,
  setVariantSku,
} from "@/lib/shopify/inventory";

type GenerateSkuBody = {
  variantId?: number;
  prefix?: string;
  sku?: string;
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
  const customSku = body.sku?.trim();
  const variantIdInt = Math.floor(variantId);

  try {
    let sku: string;

    if (customSku) {
      if (customSku.length > 255) {
        return NextResponse.json(
          { ok: false, error: "SKU must be 255 characters or fewer." },
          { status: 400 },
        );
      }

      if (await isSkuTaken(customSku, { exceptVariantId: variantIdInt })) {
        return NextResponse.json(
          { ok: false, error: `SKU "${customSku}" is already in use.` },
          { status: 409 },
        );
      }

      sku = customSku;
    } else {
      sku = await suggestUniqueSku(prefix);
    }

    const assignedSku = await setVariantSku(variantIdInt, sku);

    return NextResponse.json({
      ok: true,
      sku: assignedSku,
      variantId: variantIdInt,
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
