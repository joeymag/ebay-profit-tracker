import { NextResponse } from "next/server";

import {
  temuCall,
  temuCallFlat,
  temuCallValues,
  TemuApiError,
} from "@/lib/temu/client";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

export const maxDuration = 60;

type OrderList = {
  totalItemNum?: number;
  pageItems?: Array<{
    parentOrderMap?: { parentOrderSn?: string; parentOrderStatus?: number };
  }>;
};

type TemuMoney = { amount?: number | string; currency?: string };

type TemuAmount = {
  parentOrderMap?: {
    salesProceeds?: {
      basePriceTotal?: TemuMoney;
      estimatedSettlementTotal?: TemuMoney;
    };
  };
  orderList?: Array<{
    orderSn?: string;
    unitBasePrice?: TemuMoney;
    basePriceTotal?: TemuMoney;
    estimatedSettlementTotal?: TemuMoney;
  }>;
};

function money(value: TemuMoney | undefined) {
  if (value == null || value.amount == null) return null;
  const amount = Number(value.amount);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: value.currency ?? null };
}

function hasMoney(value: ReturnType<typeof money>) {
  return value != null && value.amount > 0;
}

function summary(result: OrderList) {
  const byStatus: Record<string, number> = {};
  for (const item of result.pageItems ?? []) {
    const status = String(item.parentOrderMap?.parentOrderStatus ?? "none");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  return {
    ok: true as const,
    reportedTotal: result.totalItemNum ?? null,
    pageCount: result.pageItems?.length ?? 0,
    byStatus,
    sampleParentOrderSn:
      result.pageItems?.[0]?.parentOrderMap?.parentOrderSn ?? null,
  };
}

function failure(error: unknown) {
  return {
    ok: false as const,
    error:
      error instanceof TemuApiError || error instanceof Error
        ? error.message
        : "Temu request failed.",
  };
}

export async function GET() {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, error: "Temu is not connected." }, { status: 400 });
  }

  const end = Math.floor(Date.now() / 1000);
  const start = end - 7 * 24 * 60 * 60;
  const request = {
    updateAtStart: start,
    updateAtEnd: end,
    pageNumber: 1,
    pageSize: 5,
  };

  let values: ReturnType<typeof summary> | ReturnType<typeof failure>;
  try {
    values = summary(
      await temuCallValues<OrderList>(credentials, "bg.order.list.v2.get", request),
    );
  } catch (error) {
    values = failure(error);
  }

  let nested: ReturnType<typeof summary> | ReturnType<typeof failure> | { skipped: true };
  if (values.ok) {
    nested = { skipped: true };
  } else {
    try {
      nested = summary(
        await temuCall<OrderList>(credentials, "bg.order.list.v2.get", request),
      );
    } catch (error) {
      nested = failure(error);
    }
  }

  const parentOrderSn =
    (values.ok ? values.sampleParentOrderSn : null) ||
    (nested && "ok" in nested && nested.ok ? nested.sampleParentOrderSn : null);

  let amount:
    | {
        ok: true;
        parentOrderSn: string;
        hasAnyPrice: boolean;
        samplePrices: Array<{
          orderSn: string | null;
          unitBasePrice: ReturnType<typeof money>;
          basePriceTotal: ReturnType<typeof money>;
          estimatedSettlementTotal: ReturnType<typeof money>;
        }>;
        parentBasePriceTotal: ReturnType<typeof money>;
        parentSettlementTotal: ReturnType<typeof money>;
      }
    | ReturnType<typeof failure>
    | { skipped: true; reason: string };

  if (!parentOrderSn) {
    amount = { skipped: true, reason: "no orders in window" };
  } else {
    try {
      const priced = await temuCallFlat<TemuAmount>(
        credentials,
        "temu.order.amount.v2.query",
        { parentOrderSn },
      );
      const samplePrices = (priced.orderList ?? []).slice(0, 3).map((line) => ({
        orderSn: line.orderSn ?? null,
        unitBasePrice: money(line.unitBasePrice),
        basePriceTotal: money(line.basePriceTotal),
        estimatedSettlementTotal: money(line.estimatedSettlementTotal),
      }));
      const parentBasePriceTotal = money(
        priced.parentOrderMap?.salesProceeds?.basePriceTotal,
      );
      const parentSettlementTotal = money(
        priced.parentOrderMap?.salesProceeds?.estimatedSettlementTotal,
      );
      amount = {
        ok: true,
        parentOrderSn,
        samplePrices,
        parentBasePriceTotal,
        parentSettlementTotal,
        hasAnyPrice:
          samplePrices.some(
            (p) =>
              hasMoney(p.unitBasePrice) ||
              hasMoney(p.basePriceTotal) ||
              hasMoney(p.estimatedSettlementTotal),
          ) ||
          hasMoney(parentBasePriceTotal) ||
          hasMoney(parentSettlementTotal),
      };
    } catch (error) {
      amount = failure(error);
    }
  }

  return NextResponse.json({
    ok: true,
    region: credentials.region,
    mallId: credentials.mallId,
    values,
    nested,
    amount,
  });
}
