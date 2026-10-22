import type { MarketplaceSale } from "@/lib/marketplace-orders/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { temuCall, temuCallFlat, temuCallValues, TemuApiError } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

type TemuMoney = { amount?: number; currency?: string };

type TemuOrderList = {
  totalItemNum?: number;
  pageItems?: Array<{
    parentOrderMap?: {
      parentOrderSn?: string;
      parentOrderStatus?: number;
      parentOrderTime?: number;
      hasShippingFee?: boolean;
    };
    orderList?: Array<{
      orderSn?: string;
      quantity?: number;
      goodsName?: string;
      originalGoodsName?: string;
      skuId?: number | string;
      productList?: Array<{ extCode?: string; soldFactor?: number }>;
    }>;
  }>;
};

type TemuShipping = {
  receiptName?: string;
  mobile?: string;
  mail?: string;
  regionName1?: string;
  regionName2?: string;
  regionName3?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  postCode?: string;
  addressExtra?: { firstName?: string; lastName?: string };
};

type TemuAmount = {
  parentOrderMap?: {
    /** v1 (`bg.order.amount.query`) — matches seller UI "Estimated revenue". */
    estimatedRevenue?: TemuMoney;
    estimatedRevenueDeduction?: TemuMoney;
    shippingAmountTotal?: TemuMoney;
    basePriceTotal?: TemuMoney;
    taxTotalAfterDiscount?: TemuMoney;
    /** v2 (`temu.order.amount.v2.query`). */
    salesProceeds?: {
      shippingTotalTaxExcl?: TemuMoney;
      basePriceTotal?: TemuMoney;
      estimatedSettlementTotal?: TemuMoney;
      estimatedDeduction?: TemuMoney;
    };
  };
  orderList?: Array<{
    orderSn?: string;
    unitBasePrice?: TemuMoney;
    basePrice?: TemuMoney;
    basePriceTotal?: TemuMoney;
    estimatedSettlementTotal?: TemuMoney;
    estimatedRevenue?: TemuMoney;
    quantity?: number;
  }>;
};

const IMPORT_STATUSES = new Set([2, 4, 41, 5, 51]);
const CANCELLED_STATUS = 3;

function minorToMajor(money: TemuMoney | undefined): number {
  const raw = Number(money?.amount);
  if (!Number.isFinite(raw)) return 0;
  return Number.isInteger(raw) ? raw / 100 : raw;
}

function countryCode(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === "UK" || upper === "GB" || /united kingdom|great britain|england/i.test(raw)) {
    return "GB";
  }
  if (upper === "IE" || /ireland/i.test(raw)) return "IE";
  if (upper === "US" || upper === "USA" || /united states/i.test(raw)) return "US";
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

async function catalogSkuByTemuSku(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!isSupabaseConfigured()) return map;
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .select("sku, temu_sku")
      .not("temu_sku", "is", null);
    if (error || !data) return map;
    for (const row of data) {
      const temu = row.temu_sku?.trim().toLowerCase();
      const sku = row.sku?.trim();
      if (temu && sku) map.set(temu, sku);
    }
  } catch {
    return map;
  }
  return map;
}

function lineSku(
  extCode: string | null,
  skuId: string | null,
  catalog: Map<string, string>,
): { sku: string | null; temuSku: string | null } {
  const temuSku = extCode || skuId;
  if (!temuSku) return { sku: null, temuSku: null };
  const mapped =
    catalog.get(temuSku.toLowerCase()) ||
    (skuId ? catalog.get(skuId.toLowerCase()) : undefined);
  return { sku: mapped || extCode || skuId, temuSku };
}

function orderListFields(
  request: Record<string, unknown>,
  page: number,
): Record<string, string | number> {
  const fields: Record<string, string | number> = {
    pageNumber: page,
    pageSize: 50,
  };
  for (const [key, value] of Object.entries(request)) {
    if (typeof value === "number" && Number.isFinite(value)) fields[key] = value;
    else if (typeof value === "string" && value.trim()) fields[key] = value.trim();
  }
  return fields;
}

async function listOrders(
  credentials: TemuCredentials,
  request: Record<string, unknown>,
): Promise<NonNullable<TemuOrderList["pageItems"]>> {
  const items: NonNullable<TemuOrderList["pageItems"]> = [];
  for (let page = 1; page <= 4; page += 1) {
    const fields = orderListFields(request, page);
    let result: TemuOrderList;
    try {
      result = await temuCallValues<TemuOrderList>(
        credentials,
        "bg.order.list.v2.get",
        fields,
      );
    } catch (error) {
      if (!(error instanceof TemuApiError) || !/invalid param/i.test(error.message)) {
        throw error;
      }
      result = await temuCall<TemuOrderList>(credentials, "bg.order.list.v2.get", {
        ...request,
        pageNumber: page,
        pageSize: 50,
      });
    }
    const batch = result.pageItems ?? [];
    items.push(...batch);
    if (batch.length < 50) break;
  }
  return items;
}

function moneyAmount(money: TemuMoney | undefined): number {
  return minorToMajor(money);
}

/** Seller UI "Estimated revenue" — v1 field, or v2 estimatedSettlementTotal. */
function parentEstimatedRevenue(amount: TemuAmount | null | undefined): TemuMoney | undefined {
  const parent = amount?.parentOrderMap;
  if (!parent) return undefined;
  if (moneyAmount(parent.estimatedRevenue) > 0) return parent.estimatedRevenue;
  if (moneyAmount(parent.salesProceeds?.estimatedSettlementTotal) > 0) {
    return parent.salesProceeds?.estimatedSettlementTotal;
  }
  return parent.estimatedRevenue || parent.salesProceeds?.estimatedSettlementTotal;
}

function parentShippingAmount(amount: TemuAmount | null | undefined): TemuMoney | undefined {
  const parent = amount?.parentOrderMap;
  if (!parent) return undefined;
  if (moneyAmount(parent.shippingAmountTotal) > 0) return parent.shippingAmountTotal;
  if (moneyAmount(parent.salesProceeds?.shippingTotalTaxExcl) > 0) {
    return parent.salesProceeds?.shippingTotalTaxExcl;
  }
  return parent.shippingAmountTotal || parent.salesProceeds?.shippingTotalTaxExcl;
}

function parentCurrency(amount: TemuAmount | null | undefined): string | undefined {
  const parent = amount?.parentOrderMap;
  return (
    parent?.estimatedRevenue?.currency ||
    parent?.salesProceeds?.estimatedSettlementTotal?.currency ||
    parent?.basePriceTotal?.currency ||
    parent?.salesProceeds?.basePriceTotal?.currency ||
    parent?.shippingAmountTotal?.currency ||
    amount?.orderList?.find((line) => line.unitBasePrice?.currency)?.unitBasePrice?.currency ||
    amount?.orderList?.find((line) => line.estimatedSettlementTotal?.currency)
      ?.estimatedSettlementTotal?.currency
  );
}

function hasUsableEstimatedRevenue(amount: TemuAmount): boolean {
  if (moneyAmount(parentEstimatedRevenue(amount)) > 0) return true;
  return (amount.orderList ?? []).some(
    (line) =>
      moneyAmount(line.estimatedSettlementTotal) > 0 ||
      moneyAmount(line.estimatedRevenue) > 0,
  );
}

async function loadOrderAmount(
  credentials: TemuCredentials,
  parentOrderSn: string,
): Promise<TemuAmount | null> {
  // Prefer v1 for EU/UK (has estimatedRevenue); v2 often "not applicable" there.
  const types = ["bg.order.amount.query", "temu.order.amount.v2.query"] as const;
  let fallback: TemuAmount | null = null;
  for (const type of types) {
    try {
      const result = await temuCallFlat<TemuAmount>(credentials, type, {
        parentOrderSn,
      });
      if (hasUsableEstimatedRevenue(result)) return result;
      if (!fallback) fallback = result;
    } catch (error) {
      if (
        error instanceof TemuApiError &&
        /not applicable|don't have this api access|invalid param|BUSINESS_SERVICE_ERROR/i.test(
          error.message,
        )
      ) {
        continue;
      }
      throw error;
    }
  }
  return fallback;
}

function lineGoodsWeight(line: {
  quantity: number;
  unitBasePrice?: TemuMoney;
  basePriceTotal?: TemuMoney;
  estimatedSettlementTotal?: TemuMoney;
  estimatedRevenue?: TemuMoney;
}): number {
  const baseTotal = moneyAmount(line.basePriceTotal);
  if (baseTotal > 0) return baseTotal;
  const unit = moneyAmount(line.unitBasePrice);
  if (unit > 0 && line.quantity > 0) return unit * line.quantity;
  const settlement =
    moneyAmount(line.estimatedSettlementTotal) || moneyAmount(line.estimatedRevenue);
  if (settlement > 0) return settlement;
  return Math.max(line.quantity, 1);
}

async function toSale(
  credentials: TemuCredentials,
  item: NonNullable<TemuOrderList["pageItems"]>[number],
  catalog: Map<string, string>,
): Promise<MarketplaceSale | null> {
  const parent = item.parentOrderMap;
  const orderId = parent?.parentOrderSn?.trim();
  const status = parent?.parentOrderStatus;
  if (!orderId || status == null || !IMPORT_STATUSES.has(status)) return null;

  const [shipping, amount] = await Promise.all([
    temuCallFlat<TemuShipping>(credentials, "bg.order.shippinginfo.v2.get", {
      parentOrderSn: orderId,
    }),
    loadOrderAmount(credentials, orderId),
  ]);

  const amountBySn = new Map(
    (amount?.orderList ?? []).map((line) => [line.orderSn?.trim() ?? "", line]),
  );

  // Estimated revenue (seller UI) is the order total. Keep Temu shipping as a
  // separate Shopify shipping line; put the remainder on the product lines.
  const estimatedTotal = moneyAmount(parentEstimatedRevenue(amount));
  const shippingTotal = moneyAmount(parentShippingAmount(amount));
  const goodsBudget =
    estimatedTotal > 0 ? Math.max(0, estimatedTotal - shippingTotal) : 0;

  type PricedDraft = {
    sku: string | null;
    title: string;
    quantity: number;
    weight: number;
    fallbackUnit: number;
    temuSku: string | null;
  };

  const drafts: PricedDraft[] = [];
  for (const line of item.orderList ?? []) {
    const quantity = line.quantity ?? 0;
    if (quantity <= 0 || line.orderSn == null) continue;
    const product = line.productList?.[0];
    const extCode = product?.extCode?.trim() || null;
    const skuId = line.skuId == null ? null : String(line.skuId);
    const resolved = lineSku(extCode, skuId, catalog);
    const priced = amountBySn.get(line.orderSn.trim());
    const unitFromBase = moneyAmount(priced?.unitBasePrice);
    const baseTotal = moneyAmount(priced?.basePriceTotal);
    const settlement =
      moneyAmount(priced?.estimatedSettlementTotal) ||
      moneyAmount(priced?.estimatedRevenue);
    const fallbackUnit =
      unitFromBase > 0
        ? unitFromBase
        : quantity > 0 && baseTotal > 0
          ? baseTotal / quantity
          : quantity > 0
            ? settlement / quantity
            : 0;
    drafts.push({
      sku: resolved.sku,
      title:
        line.originalGoodsName?.trim() ||
        line.goodsName?.trim() ||
        resolved.sku ||
        "Temu item",
      quantity,
      weight: priced
        ? lineGoodsWeight({ ...priced, quantity })
        : Math.max(quantity, 1),
      fallbackUnit,
      temuSku: resolved.temuSku,
    });
  }

  if (drafts.length === 0) return null;

  const weightSum = drafts.reduce((sum, draft) => sum + draft.weight, 0);
  const allocatedUnits: number[] = [];
  if (goodsBudget > 0 && weightSum > 0) {
    let allocatedGoods = 0;
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index]!;
      if (draft.quantity <= 0) {
        allocatedUnits.push(0);
        continue;
      }
      if (index === drafts.length - 1) {
        const remainder = Math.max(0, goodsBudget - allocatedGoods);
        const unit = Math.round((remainder / draft.quantity) * 100) / 100;
        allocatedUnits.push(unit);
        allocatedGoods += unit * draft.quantity;
      } else {
        const share = (goodsBudget * draft.weight) / weightSum;
        const unit = Math.round((share / draft.quantity) * 100) / 100;
        allocatedUnits.push(unit);
        allocatedGoods += unit * draft.quantity;
      }
    }
  }

  const lines = drafts.map((draft, index) => {
    const unitPrice =
      allocatedUnits.length > 0 ? (allocatedUnits[index] ?? 0) : draft.fallbackUnit;
    return {
      sku: draft.sku,
      title: draft.title,
      quantity: draft.quantity,
      unitPrice,
      ...(draft.temuSku
        ? { properties: [{ name: "Temu item sku id", value: draft.temuSku }] }
        : {}),
    };
  });

  const country = countryCode(shipping.regionName1);
  const first = shipping.addressExtra?.firstName?.trim();
  const last = shipping.addressExtra?.lastName?.trim();
  const name =
    shipping.receiptName?.trim() ||
    [first, last].filter(Boolean).join(" ") ||
    null;
  const currency = parentCurrency(amount) || "GBP";
  const createdSeconds = parent?.parentOrderTime;

  return {
    channel: "Temu",
    orderId,
    createdAt: createdSeconds
      ? new Date(createdSeconds * 1000).toISOString()
      : new Date().toISOString(),
    currency,
    email: shipping.mail?.trim() || null,
    shipping: shippingTotal,
    address: shipping.addressLine1
      ? {
          name,
          address1: shipping.addressLine1.trim(),
          address2:
            [shipping.addressLine2, shipping.addressLine3]
              .map((part) => part?.trim())
              .filter(Boolean)
              .join(", ") || null,
          city: shipping.regionName3?.trim() || null,
          province: country === "GB" ? null : shipping.regionName2?.trim() || null,
          zip: shipping.postCode?.trim() || null,
          countryCode: country,
          phone: shipping.mobile?.trim() || null,
        }
      : null,
    lines,
  };
}

export async function fetchRecentTemuSales(days: number): Promise<MarketplaceSale[]> {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) return [];

  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 60 * 60;
  const items = await listOrders(credentials, {
    updateAtStart: start,
    updateAtEnd: end,
  });
  const catalog = await catalogSkuByTemuSku();
  const ranked = [...items].sort((left, right) => {
    const leftOpen = left.parentOrderMap?.parentOrderStatus === 2 ? 0 : 1;
    const rightOpen = right.parentOrderMap?.parentOrderStatus === 2 ? 0 : 1;
    return leftOpen - rightOpen;
  });

  const sales: MarketplaceSale[] = [];
  for (const item of ranked) {
    if (sales.length >= 25) break;
    const sale = await toSale(credentials, item, catalog);
    if (sale) sales.push(sale);
  }
  return sales;
}

export async function fetchRecentTemuCancelledIds(days: number): Promise<string[]> {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) return [];
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 60 * 60;
  const items = await listOrders(credentials, {
    parentOrderStatus: CANCELLED_STATUS,
    updateAtStart: start,
    updateAtEnd: end,
  });
  return items
    .map((item) => item.parentOrderMap?.parentOrderSn?.trim() ?? "")
    .filter(Boolean);
}
