import type { AccountPayment } from "@/lib/accounting/payments";
import { temuCall, temuCallFlat, TemuApiError } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

type TemuOrderList = {
  pageItems?: Array<{
    parentOrderMap?: {
      parentOrderSn?: string;
      parentOrderStatus?: number;
      parentOrderTime?: number;
    };
    orderList?: Array<{ goodsName?: string; originalGoodsName?: string }>;
  }>;
};

const STATUS_LABEL: Record<number, string> = {
  1: "Pending",
  2: "Unshipped",
  3: "Cancelled",
  4: "Shipped",
  41: "Partially shipped",
  5: "Delivered",
  51: "Partially delivered",
};

const SETTLEMENT_KEYS = [
  "estimatedSettlementTotal",
  "estimatedRevenue",
  "basePriceDiscountedTotal",
  "basePriceTotal",
];

type Money = { amount: number; currency: string };
type AmountStyle = "nested" | "flat";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readMoney(value: unknown): Money | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { amount: Number.isInteger(value) ? value / 100 : value, currency: "GBP" };
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    const raw = Number(value);
    return { amount: Number.isInteger(raw) ? raw / 100 : raw, currency: "GBP" };
  }
  const record = asRecord(value);
  if (!record) return null;
  const nested = record.amount ?? record.value ?? record.price ?? record.centAmount;
  if (nested && typeof nested === "object") return readMoney(nested);
  const raw = Number(nested);
  if (!Number.isFinite(raw)) return null;
  const currency = String(
    record.currency ?? record.currencyCode ?? record.currencyType ?? "GBP",
  ).trim();
  return {
    amount: Number.isInteger(raw) ? raw / 100 : raw,
    currency: currency || "GBP",
  };
}

function findSettlement(value: unknown): Money | null {
  const queue: unknown[] = [value];
  let zero: Money | null = null;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = current as Record<string, unknown>;
    for (const key of SETTLEMENT_KEYS) {
      if (!(key in record)) continue;
      const money = readMoney(record[key]);
      if (!money) continue;
      if (money.amount !== 0) return money;
      zero ??= money;
    }
    queue.push(...Object.values(record));
  }
  return zero;
}

function orderDate(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const ms = value > 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function listOrders(credentials: TemuCredentials, days: number) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 60 * 60;
  const items: NonNullable<TemuOrderList["pageItems"]> = [];
  for (let page = 1; page <= 2; page += 1) {
    const result = await temuCall<TemuOrderList>(credentials, "bg.order.list.v2.get", {
      updateAtStart: start,
      updateAtEnd: end,
      pageNumber: page,
      pageSize: 50,
    });
    const batch = result.pageItems ?? [];
    items.push(...batch);
    if (batch.length < 50) break;
  }
  return items;
}

const AMOUNT_TYPES = ["temu.order.amount.v2.query", "bg.order.amount.query"];

async function queryAmount(
  credentials: TemuCredentials,
  type: string,
  orderId: string,
  style: AmountStyle,
): Promise<Money | null> {
  const result =
    style === "flat"
      ? await temuCallFlat<unknown>(credentials, type, { parentOrderSn: orderId })
      : await temuCall<unknown>(credentials, type, { parentOrderSn: orderId });
  return findSettlement(result);
}

async function loadSalesProceeds(
  credentials: TemuCredentials,
  orderId: string,
  chosen: { type: string; style: AmountStyle } | null,
): Promise<{ money: Money | null; error: string | null; chosen: { type: string; style: AmountStyle } | null }> {
  const attempts = chosen
    ? [chosen]
    : AMOUNT_TYPES.flatMap((type) => [
        { type, style: "nested" as const },
        { type, style: "flat" as const },
      ]);

  let error: string | null = null;
  for (const attempt of attempts) {
    try {
      const money = await queryAmount(credentials, attempt.type, orderId, attempt.style);
      if (money) return { money, error: null, chosen: attempt };
    } catch (caught) {
      error = caught instanceof TemuApiError || caught instanceof Error ? caught.message : "Temu rejected the amount request.";
    }
  }
  return { money: null, error, chosen };
}

export async function listTemuAccountPayments(days = 30): Promise<{
  payments: AccountPayment[];
  warning: string | null;
}> {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) return { payments: [], warning: null };

  const orders = (await listOrders(credentials, days)).slice(0, 25);
  const payments: AccountPayment[] = [];
  let chosen: { type: string; style: AmountStyle } | null = null;
  let warning: string | null = null;

  for (const item of orders) {
    const parent = item.parentOrderMap;
    const orderId = parent?.parentOrderSn?.trim();
    const date = orderDate(parent?.parentOrderTime);
    if (!orderId || !date) continue;
    const status = parent?.parentOrderStatus;
    const loaded = await loadSalesProceeds(credentials, orderId, chosen);
    if (loaded.chosen && loaded.money) chosen = loaded.chosen;
    if (!loaded.money && loaded.error && !warning) warning = loaded.error;
    const description =
      item.orderList
        ?.map((line) => line.goodsName?.trim() || line.originalGoodsName?.trim())
        .filter(Boolean)
        .join(", ") || "Temu order";
    payments.push({
      id: orderId,
      date,
      type: status === 3 ? "Cancelled order" : "Order",
      status: STATUS_LABEL[status ?? -1] ?? "Order",
      reference: orderId,
      description,
      amount: loaded.money?.amount ?? null,
      currency: loaded.money?.currency ?? "GBP",
    });
    if (!chosen && payments.length >= 2) break;
  }

  if (!chosen && orders.length > payments.length) {
    for (const item of orders.slice(payments.length)) {
      const parent = item.parentOrderMap;
      const orderId = parent?.parentOrderSn?.trim();
      const date = orderDate(parent?.parentOrderTime);
      if (!orderId || !date) continue;
      const status = parent?.parentOrderStatus;
      payments.push({
        id: orderId,
        date,
        type: status === 3 ? "Cancelled order" : "Order",
        status: STATUS_LABEL[status ?? -1] ?? "Order",
        reference: orderId,
        description:
          item.orderList
            ?.map((line) => line.goodsName?.trim() || line.originalGoodsName?.trim())
            .filter(Boolean)
            .join(", ") || "Temu order",
        amount: null,
        currency: "GBP",
      });
    }
  }

  payments.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const anyAmount = payments.some((payment) => payment.amount != null);
  return {
    payments,
    warning: anyAmount ? null : warning,
  };
}
