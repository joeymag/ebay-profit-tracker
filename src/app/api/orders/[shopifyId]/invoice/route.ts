import { NextResponse } from "next/server";

import {
  buildOrderInvoicePdf,
  getInvoiceVatNumber,
} from "@/lib/orders/invoice-pdf";
import { getPackSheetCompanyInfo } from "@/lib/orders/pack-sheet-company";
import { getStoredOrderByShopifyId } from "@/lib/orders/store";

type RouteContext = {
  params: Promise<{ shopifyId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { shopifyId: rawId } = await context.params;
  const shopifyId = Number(rawId);
  if (!Number.isFinite(shopifyId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid Shopify order id." },
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
    const company = await getPackSheetCompanyInfo();
    const pdfBytes = await buildOrderInvoicePdf(order, {
      ...company,
      vatNumber: getInvoiceVatNumber(),
    });
    const filename = `invoice-${order.orderNumber.replace(/[^\w.-]+/g, "_")}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build invoice PDF";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
