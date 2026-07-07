import { getSalesChannel } from "@/lib/orders/channel";
import { computeOrderFinancials } from "@/lib/orders/financials";
import { computeEbayFees } from "@/lib/orders/platform-fees";
import {
  effectiveProductCost,
  getProductCostBreakdown,
} from "@/lib/orders/product-cost-vat";
import type { StoredLineItem, StoredOrder } from "@/lib/orders/types";

const CSV_HEADERS = [
  "Order Number",
  "Order Date",
  "Channel",
  "SKU",
  "Product Title",
  "Quantity",
  "Unit Cost Ex VAT",
  "Unit Cost Incl VAT",
  "Line Product Cost",
  "Order Revenue",
  "Order Product Cost Ex VAT",
  "Order Product Cost Incl VAT",
  "Postage",
  "eBay Selling Fees",
  "eBay Ads Fees",
  "Total Platform Fees",
  "Total Cost",
  "Profit",
  "Currency",
] as const;

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCsvNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(2);
}

function formatCsvDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function lineUnitCostInclVat(
  unitCostExVat: number | null,
  tags: string | null,
): number | null {
  if (unitCostExVat == null) {
    return null;
  }
  return effectiveProductCost(unitCostExVat, tags);
}

function lineProductCost(
  item: StoredLineItem,
  tags: string | null,
): number | null {
  const unitIncl = lineUnitCostInclVat(item.unitCost, tags);
  if (unitIncl == null) {
    return null;
  }
  return Math.round(unitIncl * item.quantity * 100) / 100;
}

function getEbayFeeColumns(order: StoredOrder): {
  selling: number | null;
  ads: number | null;
} {
  if (getSalesChannel(order.tags) !== "eBay") {
    return { selling: null, ads: null };
  }

  if (order.ebayFeesActual != null && order.ebayFeesActual >= 0) {
    const ads =
      order.ebayAdsFeeActual != null && order.ebayAdsFeeActual >= 0
        ? order.ebayAdsFeeActual
        : 0;
    return {
      selling: Math.max(0, order.ebayFeesActual - ads),
      ads: ads > 0 ? ads : null,
    };
  }

  const fees = computeEbayFees(
    order.revenue,
    order.ebayFeeRate,
    order.ebayAdsFeeRate,
  );

  const selling =
    fees.finalValueFee + (fees.sellingFee != null ? fees.sellingFee : 0);

  return {
    selling: selling > 0 ? selling : null,
    ads: fees.adsFee,
  };
}

function buildOrderRow(
  order: StoredOrder,
  item: StoredLineItem | null,
): string[] {
  const { platformFee, cost, profit } = computeOrderFinancials(order);
  const productBreakdown = getProductCostBreakdown(order);
  const ebayFees = getEbayFeeColumns(order);
  const unitExVat = item?.unitCost ?? null;
  const unitInclVat = item ? lineUnitCostInclVat(item.unitCost, order.tags) : null;
  const lineCost = item ? lineProductCost(item, order.tags) : null;

  return [
    order.orderNumber,
    formatCsvDate(order.createdAt),
    getSalesChannel(order.tags),
    item?.sku ?? "",
    item?.title ?? "",
    item ? String(item.quantity) : "",
    formatCsvNumber(unitExVat),
    formatCsvNumber(unitInclVat),
    formatCsvNumber(lineCost),
    formatCsvNumber(order.revenue),
    formatCsvNumber(productBreakdown.exVat),
    formatCsvNumber(productBreakdown.inclVat),
    formatCsvNumber(order.shippingLabelCost),
    formatCsvNumber(ebayFees.selling),
    formatCsvNumber(ebayFees.ads),
    formatCsvNumber(platformFee),
    formatCsvNumber(cost),
    formatCsvNumber(profit),
    order.currency,
  ];
}

export function buildOrdersCsv(orders: StoredOrder[]): string {
  const rows: string[] = [CSV_HEADERS.join(",")];

  for (const order of orders) {
    if (order.lineItems.length === 0) {
      rows.push(buildOrderRow(order, null).map(escapeCsvField).join(","));
      continue;
    }

    for (const item of order.lineItems) {
      rows.push(buildOrderRow(order, item).map(escapeCsvField).join(","));
    }
  }

  return `\uFEFF${rows.join("\r\n")}`;
}

export function ordersCsvFilename(rangeKey: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = rangeKey.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `orders-${slug}-${date}.csv`;
}
