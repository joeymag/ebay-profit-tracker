import { NextResponse } from "next/server";

import { buildStockLabelPdf } from "@/lib/labels/stock-label-pdf";
import { lookupStockBySku } from "@/lib/shopify/inventory";

export const maxDuration = 30;

function filenameFromNames(topName: string, bottomName: string) {
  const slug = (part: string) =>
    part
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 28);

  const a = slug(topName) || "product";
  const b = slug(bottomName);
  if (!b || b === a) {
    return `stock-label-${a}.pdf`;
  }
  return `stock-label-${a}-${b}.pdf`;
}

function defaultName(item: {
  productTitle: string;
  variantTitle: string;
}) {
  if (item.variantTitle && item.variantTitle !== "Default Title") {
    return `${item.productTitle} ${item.variantTitle}`;
  }
  return item.productTitle;
}

async function resolveHalf(options: {
  sku: string;
  titleOverride: string | null;
  barcodeOverride: string | null;
}) {
  const item = await lookupStockBySku(options.sku);
  if (!item) {
    return {
      ok: false as const,
      status: 404,
      error: `No Shopify product found for SKU "${options.sku}".`,
    };
  }

  const productName = options.titleOverride || defaultName(item);
  const barcodeValue =
    options.barcodeOverride || item.barcode?.trim() || item.sku.trim();

  if (!barcodeValue) {
    return {
      ok: false as const,
      status: 400,
      error: `No barcode or SKU available for "${options.sku}".`,
    };
  }

  return {
    ok: true as const,
    half: { productName, barcodeValue },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku")?.trim();
  const sku2 = searchParams.get("sku2")?.trim() || null;
  const titleOverride = searchParams.get("title")?.trim() || null;
  const title2Override = searchParams.get("title2")?.trim() || null;
  const barcodeOverride = searchParams.get("barcode")?.trim() || null;
  const barcode2Override = searchParams.get("barcode2")?.trim() || null;
  const copiesRaw = Number.parseInt(searchParams.get("copies") ?? "1", 10);
  const copies = Number.isFinite(copiesRaw) ? copiesRaw : 1;

  if (!sku) {
    return NextResponse.json(
      { ok: false, error: "Top SKU is required." },
      { status: 400 },
    );
  }

  try {
    const topResult = await resolveHalf({
      sku,
      titleOverride,
      barcodeOverride,
    });
    if (!topResult.ok) {
      return NextResponse.json(
        { ok: false, error: topResult.error },
        { status: topResult.status },
      );
    }

    let bottom = topResult.half;
    if (sku2) {
      const bottomResult = await resolveHalf({
        sku: sku2,
        titleOverride: title2Override,
        barcodeOverride: barcode2Override,
      });
      if (!bottomResult.ok) {
        return NextResponse.json(
          { ok: false, error: bottomResult.error },
          { status: bottomResult.status },
        );
      }
      bottom = bottomResult.half;
    }

    const pdfBytes = await buildStockLabelPdf({
      top: topResult.half,
      bottom,
      copies,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filenameFromNames(
          topResult.half.productName,
          bottom.productName,
        )}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not build stock label.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
