import { NextResponse } from "next/server";

import { getShopifyConfig } from "@/lib/shopify/config";
import {
  getShopifyShippingLabelPurchaseStatus,
  purchaseShopifyShippingLabel,
  syncPostageCostAfterLabelPurchase,
} from "@/lib/shopify/shipping-label-purchase";

type RouteContext = {
  params: Promise<{ shopifyId: string }>;
};

function parsePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }
  return value;
}

export async function POST(request: Request, context: RouteContext) {
  const config = getShopifyConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Shopify is not configured." },
      { status: 400 },
    );
  }

  const { shopifyId: rawId } = await context.params;
  const shopifyId = Number(rawId);
  if (!Number.isFinite(shopifyId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid Shopify order id." },
      { status: 400 },
    );
  }

  let body: {
    fulfillmentOrderId?: string;
    totalWeightGrams?: number;
    packageWeightGrams?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    notifyCustomer?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.fulfillmentOrderId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "fulfillmentOrderId is required." },
      { status: 400 },
    );
  }

  try {
    const totalWeightGrams = parsePositiveNumber(
      body.totalWeightGrams,
      "totalWeightGrams",
    );
    const packageWeightGrams = parsePositiveNumber(
      body.packageWeightGrams ?? 50,
      "packageWeightGrams",
    );
    const lengthCm = parsePositiveNumber(body.lengthCm, "lengthCm");
    const widthCm = parsePositiveNumber(body.widthCm, "widthCm");
    const heightCm = parsePositiveNumber(body.heightCm, "heightCm");

    const started = await purchaseShopifyShippingLabel({
      fulfillmentOrderId: body.fulfillmentOrderId.trim(),
      totalWeightGrams,
      packageWeightGrams,
      dimensionsCm: { length: lengthCm, width: widthCm, height: heightCm },
      notifyCustomer: Boolean(body.notifyCustomer),
    });

    // Poll briefly so most purchases finish in one request.
    let status = await getShopifyShippingLabelPurchaseStatus(
      started.purchaseResultId,
    );
    for (let attempt = 0; attempt < 8 && !status.done; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      status = await getShopifyShippingLabelPurchaseStatus(
        started.purchaseResultId,
      );
    }

    let postageCost: number | null = null;
    if (status.status === "PURCHASED") {
      postageCost = await syncPostageCostAfterLabelPurchase(shopifyId);
    }

    if (status.status === "PURCHASE_FAILED") {
      return NextResponse.json(
        {
          ok: false,
          error: status.errors.join("; ") || "Label purchase failed.",
          purchaseResultId: status.id,
          status: status.status,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      purchaseResultId: status.id,
      status: status.status,
      done: status.done,
      labels: status.labels,
      postageCost,
      errors: status.errors,
      message:
        status.status === "PURCHASED"
          ? "Shipping label purchased."
          : "Label purchase started. Refresh in a moment if the PDF is not ready yet.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to purchase shipping label";
    const needsScope =
      /access denied|scope|permission|buy_shipping_labels|does not exist/i.test(
        message,
      );
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: needsScope
          ? "Requires Shopify API 2026-07+, scopes write_orders + write_merchant_managed_fulfillment_orders, Shopify Shipping enabled, and buy_shipping_labels permission."
          : undefined,
      },
      { status: 502 },
    );
  }
}
