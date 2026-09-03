import { NextResponse } from "next/server";

import { buildProductBagLabelPdf } from "@/lib/labels/product-bag-label-pdf";
import { lookupStockBySku } from "@/lib/shopify/inventory";

export const maxDuration = 30;

function filenameFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `bag-label-${slug || "product"}.pdf`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku")?.trim();
  const titleOverride = searchParams.get("title")?.trim() || null;
  const copiesRaw = Number.parseInt(searchParams.get("copies") ?? "1", 10);
  const copies = Number.isFinite(copiesRaw) ? copiesRaw : 1;

  if (!sku) {
    return NextResponse.json(
      { ok: false, error: "SKU is required." },
      { status: 400 },
    );
  }

  try {
    const item = await lookupStockBySku(sku);
    if (!item) {
      return NextResponse.json(
        { ok: false, error: `No Shopify product found for SKU "${sku}".` },
        { status: 404 },
      );
    }

    const productUrl = item.storefrontUrl?.trim();
    if (!productUrl) {
      return NextResponse.json(
        { ok: false, error: "This product has no website page URL." },
        { status: 400 },
      );
    }

    const productName =
      titleOverride ||
      (item.variantTitle && item.variantTitle !== "Default Title"
        ? `${item.productTitle} ${item.variantTitle}`
        : item.productTitle);

    const pdfBytes = await buildProductBagLabelPdf({
      productName,
      productUrl,
      copies,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filenameFromName(productName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not build bag label.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
