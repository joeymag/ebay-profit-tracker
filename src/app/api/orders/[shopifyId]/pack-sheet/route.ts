import { NextResponse } from "next/server";

import {
  buildA4LabelPickSheetPdf,
  fetchShopifyLabelPdfBytes,
  isAllowedShopifyLabelDocumentUrl,
} from "@/lib/orders/pack-sheet-pdf";
import { getStoredOrderByShopifyId } from "@/lib/orders/store";

type RouteContext = {
  params: Promise<{ shopifyId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { shopifyId: rawId } = await context.params;
  const shopifyId = Number(rawId);
  if (!Number.isFinite(shopifyId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid Shopify order id." },
      { status: 400 },
    );
  }

  let body: { labelDocumentUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const labelDocumentUrl = body.labelDocumentUrl?.trim();
  if (!labelDocumentUrl) {
    return NextResponse.json(
      { ok: false, error: "labelDocumentUrl is required." },
      { status: 400 },
    );
  }
  if (!isAllowedShopifyLabelDocumentUrl(labelDocumentUrl)) {
    return NextResponse.json(
      { ok: false, error: "labelDocumentUrl must be a Shopify CDN URL." },
      { status: 400 },
    );
  }

  const order = await getStoredOrderByShopifyId(shopifyId);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "Order not found in the tracker database." },
      { status: 404 },
    );
  }

  try {
    const labelBytes = await fetchShopifyLabelPdfBytes(labelDocumentUrl);
    const pdfBytes = await buildA4LabelPickSheetPdf(order, labelBytes);
    const filename = `pack-sheet-${order.orderNumber.replace(/[^\w.-]+/g, "_")}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build pack sheet PDF";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
