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
    orderList?: Array<{ orderSn?: string; quantity?: number }>;
  }>;
};

type TemuMoney = { amount?: number | string; currency?: string };

type TemuAmount = {
  parentOrderMap?: {
    salesProceeds?: {
      basePriceTotal?: TemuMoney;
      estimatedSettlementTotal?: TemuMoney;
      shippingTotalTaxExcl?: TemuMoney;
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
    sampleParentOrderSn: result.pageItems?.[0]?.parentOrderMap?.parentOrderSn ?? null,
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

function isAuthorizedProbe(request: Request): boolean {
  const auth = request.headers.get("authorization");
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.TEMU_PROXY_SECRET?.trim(),
  ].filter(Boolean);
  return secrets.some((secret) => auth === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorizedProbe(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await getStoredTemuCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, error: "Temu is not connected." }, { status: 400 });
  }

  const end = Math.floor(Date.now() / 1000);
  const start = end - 7 * 24 * 60 * 60;
  const requestBody = {
    updateAtStart: start,
    updateAtEnd: end,
    pageNumber: 1,
    pageSize: 5,
  };

  let listResult: OrderList | null = null;
  let values: ReturnType<typeof summary> | ReturnType<typeof failure>;
  try {
    listResult = await temuCallValues<OrderList>(
      credentials,
      "bg.order.list.v2.get",
      requestBody,
    );
    values = summary(listResult);
  } catch (error) {
    values = failure(error);
  }

  let nested: ReturnType<typeof summary> | ReturnType<typeof failure> | { skipped: true };
  if (values.ok) {
    nested = { skipped: true };
  } else {
    try {
      listResult = await temuCall<OrderList>(
        credentials,
        "bg.order.list.v2.get",
        requestBody,
      );
      nested = summary(listResult);
    } catch (error) {
      nested = failure(error);
    }
  }

  const parentOrderSn =
    (values.ok ? values.sampleParentOrderSn : null) ||
    (nested && "ok" in nested && nested.ok ? nested.sampleParentOrderSn : null);

  type AmountAttempt = {
    type: string;
    shape: "flat" | "nested";
    ok: boolean;
    error?: string;
    hasAnyPrice?: boolean;
    samplePrices?: Array<{
      orderSn: string | null;
      unitBasePrice: ReturnType<typeof money>;
      basePriceTotal: ReturnType<typeof money>;
      estimatedSettlementTotal: ReturnType<typeof money>;
    }>;
    parentSalesProceeds?: {
      basePriceTotal: ReturnType<typeof money>;
      estimatedSettlementTotal: ReturnType<typeof money>;
      shippingTotalTaxExcl: ReturnType<typeof money>;
    } | null;
  };

  let amount:
    | {
        ok: true;
        parentOrderSn: string;
        hasAnyPrice: boolean;
        usedType?: string;
        parentSalesProceeds: {
          basePriceTotal: ReturnType<typeof money>;
          estimatedSettlementTotal: ReturnType<typeof money>;
          shippingTotalTaxExcl: ReturnType<typeof money>;
        } | null;
        samplePrices: Array<{
          orderSn: string | null;
          unitBasePrice: ReturnType<typeof money>;
          basePriceTotal: ReturnType<typeof money>;
          estimatedSettlementTotal: ReturnType<typeof money>;
        }>;
      }
    | ReturnType<typeof failure>
    | { skipped: true; reason: string };

  const amountAttempts: AmountAttempt[] = [];

  if (!parentOrderSn) {
    amount = { skipped: true, reason: "no orders in window" };
  } else {
    const amountTypes = [
      "temu.order.amount.v2.query",
      "bg.order.amount.query",
      "temu.order.amount.v3.query",
    ] as const;

    for (const type of amountTypes) {
      for (const shape of ["flat", "nested"] as const) {
        try {
          const priced =
            shape === "flat"
              ? await temuCallFlat<TemuAmount>(credentials, type, {
                  parentOrderSn,
                })
              : await temuCall<TemuAmount>(credentials, type, {
                  parentOrderSn,
                });
          const samplePrices = (priced.orderList ?? []).slice(0, 3).map((line) => ({
            orderSn: line.orderSn ?? null,
            unitBasePrice: money(line.unitBasePrice),
            basePriceTotal: money(line.basePriceTotal),
            estimatedSettlementTotal: money(line.estimatedSettlementTotal),
          }));
          const parentSales = priced.parentOrderMap?.salesProceeds ?? null;
          const parentSalesProceeds = parentSales
            ? {
                basePriceTotal: money(parentSales.basePriceTotal),
                estimatedSettlementTotal: money(
                  parentSales.estimatedSettlementTotal,
                ),
                shippingTotalTaxExcl: money(parentSales.shippingTotalTaxExcl),
              }
            : null;
          const hasAnyPrice =
            samplePrices.some(
              (p) =>
                hasMoney(p.unitBasePrice) ||
                hasMoney(p.basePriceTotal) ||
                hasMoney(p.estimatedSettlementTotal),
            ) ||
            hasMoney(parentSalesProceeds?.basePriceTotal ?? null) ||
            hasMoney(parentSalesProceeds?.estimatedSettlementTotal ?? null);
          amountAttempts.push({
            type,
            shape,
            ok: true,
            hasAnyPrice,
            samplePrices,
            parentSalesProceeds,
          });
        } catch (error) {
          amountAttempts.push({
            type,
            shape,
            ok: false,
            error:
              error instanceof TemuApiError || error instanceof Error
                ? error.message
                : "Temu request failed.",
          });
        }
      }
    }

    const winner =
      amountAttempts.find((a) => a.ok && a.hasAnyPrice) ??
      amountAttempts.find((a) => a.ok);
    if (winner?.ok) {
      amount = {
        ok: true,
        parentOrderSn,
        usedType: `${winner.type}/${winner.shape}`,
        parentSalesProceeds: winner.parentSalesProceeds ?? null,
        samplePrices: winner.samplePrices ?? [],
        hasAnyPrice: Boolean(winner.hasAnyPrice),
      };
    } else {
      amount = {
        ok: false,
        error: amountAttempts
          .map((a) => `${a.type}/${a.shape}: ${a.error}`)
          .join(" | "),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    tokenSource: process.env.TEMU_ACCESS_TOKEN?.trim() ? "env" : "store",
    region: credentials.region,
    mallId: credentials.mallId,
    values,
    nested,
    amount,
    amountAttempts,
  });
}
