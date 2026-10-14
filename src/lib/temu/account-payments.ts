import type { AccountPayment } from "@/lib/accounting/payments";
import { temuCall, TemuApiError } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

type TemuMoney = { amount?: number | string; currency?: string };

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

type AmountQuery = {
  parentOrderMap?: {
    salesProceeds?: Record<string, TemuMoney | undefined>;
    estimatedRevenue?: TemuMoney;
    basePriceTotal?: TemuMoney;
    shippingAmountTotal?: TemuMoney;
  };
  orderList?: Array<Record<string, TemuMoney | undefined>>;
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

function minorToMajor(money: TemuMoney | undefined): { amount: number; currency: string } | null {
  const raw = Number(money?.amount);
  if (!Number.isFinite(raw)) return null;
  const currency = money?.currency?.trim() || "GBP";
  return {
    amount: Number.isInteger(raw) ? raw / 100 : raw,
    currency,
  };
}

function firstMoney(
  source: Record<string, TemuMoney | undefined> | undefined,
  keys: string[],
): { amount: number; currency: string } | null {
  if (!source) return null;
  let zero: { amount: number; currency: string } | null = null;
  for (const key of keys) {
    const money = minorToMajor(source[key]);
    if (!money) continue;
    if (money.amount !== 0) return money;
    zero ??= money;
  }
  return zero;
}

function sumLineMoney(
  lines: Array<Record<string, TemuMoney | undefined>> | undefined,
  key: string,
): { amount: number; currency: string } | null {
  let total = 0;
  let currency = "GBP";
  let found = false;
  for (const line of lines ?? []) {
    const money = minorToMajor(line[key]);
    if (!money) continue;
    found = true;
    total += money.amount;
    currency = money.currency;
  }
  return found ? { amount: Math.round(total * 100) / 100, currency } : null;
}

function proceedsFromAmount(priced: AmountQuery): { amount: number; currency: string } | null {
  const parent = priced.parentOrderMap;
  const proceeds = parent?.salesProceeds;
  return (
    firstMoney(proceeds, ["estimatedSettlementTotal", "basePriceDiscountedTotal", "basePriceTotal"]) ??
    sumLineMoney(priced.orderList, "estimatedSettlementTotal") ??
    sumLineMoney(priced.orderList, "basePriceTotal") ??
    minorToMajor(parent?.estimatedRevenue) ??
    minorToMajor(parent?.basePriceTotal)
  );
}

async function loadSalesProceeds(
  credentials: TemuCredentials,
  orderId: string,
  preferV1: boolean,
): Promise<{ amount: number; currency: string; usedV1: boolean } | null> {
  const types = preferV1
    ? ["bg.order.amount.query"]
    : ["temu.order.amount.v2.query", "bg.order.amount.query"];

  for (const type of types) {
    try {
      const priced = await temuCall<AmountQuery>(credentials, type, {
        parentOrderSn: orderId,
      });
      const money = proceedsFromAmount(priced);
      if (money) {
        return { ...money, usedV1: type === "bg.order.amount.query" };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (error instanceof TemuApiError && /not applicable/i.test(message)) {
        continue;
      }
      if (type === types[types.length - 1]) return null;
    }
  }
  return null;
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

export async function listTemuAccountPayments(days = 30): Promise<AccountPayment[]> {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) return [];

  const orders = (await listOrders(credentials, days)).slice(0, 40);
  const payments: AccountPayment[] = [];
  let preferV1 = false;

  for (let index = 0; index < orders.length; index += 4) {
    const batch = orders.slice(index, index + 4);
    const rows = await Promise.all(
      batch.map(async (item) => {
        const parent = item.parentOrderMap;
        const orderId = parent?.parentOrderSn?.trim();
        const date = orderDate(parent?.parentOrderTime);
        if (!orderId || !date) return null;
        const status = parent?.parentOrderStatus;
        const proceeds = await loadSalesProceeds(credentials, orderId, preferV1);
        if (proceeds?.usedV1) preferV1 = true;
        const description =
          item.orderList
            ?.map((line) => line.goodsName?.trim() || line.originalGoodsName?.trim())
            .filter(Boolean)
            .join(", ") || "Temu order";
        return {
          id: orderId,
          date,
          type: status === 3 ? "Cancelled order" : "Order",
          status: STATUS_LABEL[status ?? -1] ?? "Order",
          reference: orderId,
          description,
          amount: proceeds?.amount ?? null,
          currency: proceeds?.currency ?? "GBP",
        } satisfies AccountPayment;
      }),
    );
    for (const row of rows) {
      if (row) payments.push(row);
    }
  }

  payments.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  return payments;
}
