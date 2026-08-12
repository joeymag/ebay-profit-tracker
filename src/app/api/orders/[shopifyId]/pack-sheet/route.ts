import { NextResponse } from "next/server";

import { getPackSheetCompanyInfo } from "@/lib/orders/pack-sheet-company";
import {
  buildA4LabelPickSheetPdf,
  buildTestA4PackSheetPdf,
  fetchShopifyLabelPdfBytes,
  isAllowedShopifyLabelDocumentUrl,
  isTrustedShopifyLabelDocumentUrl,
} from "@/lib/orders/pack-sheet-pdf";
import { getStoredOrderByShopifyId } from "@/lib/orders/store";
import { getShopifyShippingLabelById } from "@/lib/shopify/shipping-label-purchase";

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

  let body: {
    labelDocumentUrl?: string;
    shippingLabelId?: string;
    test?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const order = await getStoredOrderByShopifyId(shopifyId);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "Order not found in the tracker database." },
      { status: 404 },
    );
  }

  try {
    const company = await getPackSheetCompanyInfo();

    if (body.test) {
      const pdfBytes = await buildTestA4PackSheetPdf(order, company);
      const filename = `test-pack-sheet-${order.orderNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const clientLabelDocumentUrl = body.labelDocumentUrl?.trim() || "";
    const shippingLabelId =
      body.shippingLabelId?.trim() || order.shippingLabelGid?.trim() || "";

    // Prefer resolving via label GID so we always get a fresh Shopify document
    // URL. Client-supplied URLs can be stale, tracking links, or hosted on
    // signed cloud-storage hosts our strict CDN allowlist rejects.
    let labelDocumentUrl = "";
    let trustShopifySource = false;

    if (shippingLabelId) {
      const label = await getShopifyShippingLabelById(shippingLabelId);
      labelDocumentUrl = label.documentUrl?.trim() || "";
      trustShopifySource = true;
      if (!labelDocumentUrl) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Shopify returned the shipping label but no printable PDF URL. Try Open in Shopify to reprint.",
          },
          { status: 502 },
        );
      }
    } else if (clientLabelDocumentUrl) {
      labelDocumentUrl = clientLabelDocumentUrl;
    }

    if (!labelDocumentUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No shipping label on file for this order. Buy a label in this app first to enable reprint.",
        },
        { status: 400 },
      );
    }

    const urlOk = trustShopifySource
      ? isTrustedShopifyLabelDocumentUrl(labelDocumentUrl)
      : isAllowedShopifyLabelDocumentUrl(labelDocumentUrl);
    if (!urlOk) {
      return NextResponse.json(
        {
          ok: false,
          error: trustShopifySource
            ? "Shopify returned a label URL that could not be fetched safely."
            : "labelDocumentUrl must be a Shopify CDN URL (or pass shippingLabelId).",
        },
        { status: 400 },
      );
    }

    const labelBytes = await fetchShopifyLabelPdfBytes(labelDocumentUrl, {
      trustShopifySource,
    });
    const pdfBytes = await buildA4LabelPickSheetPdf(order, labelBytes, {
      company,
    });
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
