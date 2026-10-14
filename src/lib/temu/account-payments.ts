import type { AccountPayment } from "@/lib/accounting/payments";
import { temuCall, TemuApiError } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

type TemuMoney = { amount?: number; currency?: string };

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

type TemuAmount = {
  parentOrderMap?: {
    salesProceeds?: {
      basePriceTotal?: TemuMoney;
      estimatedSettlementTotal?: TemuMoney;
    };
  };
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

function minorToMajor(money: TemuMoney | undefined): number | null {
  const raw = Number(money?.amount);
  if (!Number.isFinite(raw)) return null;
  return Number.isInteger(raw) ? raw / 100 : raw;
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

  for (let index = 0; index < orders.length; index += 4) {
    const batch = orders.slice(index, index + 4);
    const rows = await Promise.all(
      batch.map(async (item) => {
        const parent = item.parentOrderMap;
        const orderId = parent?.parentOrderSn?.trim();
        const date = orderDate(parent?.parentOrderTime);
        if (!orderId || !date) return null;
        const status = parent?.parentOrderStatus;
        let amount: number | null = null;
        let currency = "GBP";
        if (status !== 3) {
          try {
            const priced = await temuCall<TemuAmount>(
              credentials,
              "temu.order.amount.v2.query",
              { parentOrderSn: orderId },
            );
            const proceeds = priced.parentOrderMap?.salesProceeds;
            const settlement = proceeds?.estimatedSettlementTotal;
            const base = proceeds?.basePriceTotal;
            amount = minorToMajor(settlement) ?? minorToMajor(base);
            currency = settlement?.currency?.trim() || base?.currency?.trim() || "GBP";
          } catch (error) {
            if (!(error instanceof TemuApiError) || !/not applicable/i.test(error.message)) {
              amount = null;
            }
          }
        }
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
          amount,
          currency,
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
