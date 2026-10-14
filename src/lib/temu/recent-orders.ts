import type { MarketplaceSale } from "@/lib/marketplace-orders/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { temuCall, TemuApiError } from "@/lib/temu/client";
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
    salesProceeds?: {
      shippingTotalTaxExcl?: TemuMoney;
      basePriceTotal?: TemuMoney;
      estimatedSettlementTotal?: TemuMoney;
    };
  };
  orderList?: Array<{
    orderSn?: string;
    unitBasePrice?: TemuMoney;
    basePriceTotal?: TemuMoney;
    estimatedSettlementTotal?: TemuMoney;
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

async function listOrders(
  credentials: TemuCredentials,
  request: Record<string, unknown>,
): Promise<NonNullable<TemuOrderList["pageItems"]>> {
  const items: NonNullable<TemuOrderList["pageItems"]> = [];
  for (let page = 1; page <= 4; page += 1) {
    const result = await temuCall<TemuOrderList>(credentials, "bg.order.list.v2.get", {
      ...request,
      pageNumber: page,
      pageSize: 50,
    });
    const batch = result.pageItems ?? [];
    items.push(...batch);
    if (batch.length < 50) break;
  }
  return items;
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
    temuCall<TemuShipping>(credentials, "bg.order.shippinginfo.v2.get", {
      parentOrderSn: orderId,
    }),
    temuCall<TemuAmount>(credentials, "temu.order.amount.v2.query", {
      parentOrderSn: orderId,
    }).catch(async (error: unknown) => {
      if (error instanceof TemuApiError && /not applicable/i.test(error.message)) {
        return null;
      }
      throw error;
    }),
  ]);

  const amountBySn = new Map(
    (amount?.orderList ?? []).map((line) => [line.orderSn?.trim() ?? "", line]),
  );
  const lines = (item.orderList ?? [])
    .map((line) => {
      const quantity = line.quantity ?? 0;
      if (quantity <= 0 || line.orderSn == null) return null;
      const product = line.productList?.[0];
      const extCode = product?.extCode?.trim() || null;
      const skuId = line.skuId == null ? null : String(line.skuId);
      const resolved = lineSku(extCode, skuId, catalog);
      const priced = amountBySn.get(line.orderSn.trim());
      const unitFromBase = minorToMajor(priced?.unitBasePrice);
      const baseTotal = minorToMajor(priced?.basePriceTotal);
      const settlement = minorToMajor(priced?.estimatedSettlementTotal);
      const unitPrice =
        unitFromBase > 0
          ? unitFromBase
          : quantity > 0 && baseTotal > 0
            ? baseTotal / quantity
            : quantity > 0
              ? settlement / quantity
              : 0;
      return {
        sku: resolved.sku,
        title:
          line.originalGoodsName?.trim() ||
          line.goodsName?.trim() ||
          resolved.sku ||
          "Temu item",
        quantity,
        unitPrice,
        ...(resolved.temuSku
          ? { properties: [{ name: "Temu item sku id", value: resolved.temuSku }] }
          : {}),
      };
    })
    .filter((line): line is NonNullable<typeof line> => line != null);

  if (lines.length === 0) return null;

  const country = countryCode(shipping.regionName1);
  const first = shipping.addressExtra?.firstName?.trim();
  const last = shipping.addressExtra?.lastName?.trim();
  const name =
    shipping.receiptName?.trim() ||
    [first, last].filter(Boolean).join(" ") ||
    null;
  const proceeds = amount?.parentOrderMap?.salesProceeds;
  const currency =
    amount?.orderList?.find((line) => line.unitBasePrice?.currency)?.unitBasePrice
      ?.currency ||
    proceeds?.estimatedSettlementTotal?.currency ||
    proceeds?.basePriceTotal?.currency ||
    "GBP";
  const createdSeconds = parent?.parentOrderTime;

  return {
    channel: "Temu",
    orderId,
    createdAt: createdSeconds
      ? new Date(createdSeconds * 1000).toISOString()
      : new Date().toISOString(),
    currency,
    email: shipping.mail?.trim() || null,
    shipping: minorToMajor(proceeds?.shippingTotalTaxExcl),
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
