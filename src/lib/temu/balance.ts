import { temuCall } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";

export type TemuFunds = {
  amount: number | null;
  currency: string;
};

export type TemuBalanceSummary = {
  currency: string;
  available: TemuFunds;
  onHold: TemuFunds;
  total: TemuFunds;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readMoney(value: unknown, fallbackCurrency: string): TemuFunds {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      amount: Number.isInteger(value) ? value / 100 : value,
      currency: fallbackCurrency,
    };
  }
  const record = asRecord(value);
  if (!record) return { amount: null, currency: fallbackCurrency };
  const currency =
    (typeof record.currency === "string" && record.currency.trim()) ||
    (typeof record.currencyType === "string" && record.currencyType.trim()) ||
    fallbackCurrency;
  const raw = record.amount ?? record.value ?? record.availableAmount;
  const parsed = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return { amount: null, currency };
  return {
    amount: Number.isInteger(parsed) ? parsed / 100 : parsed,
    currency,
  };
}

function firstMoney(record: Record<string, unknown>, keys: string[], currency: string): TemuFunds {
  for (const key of keys) {
    if (record[key] == null) continue;
    const money = readMoney(record[key], currency);
    if (money.amount != null) return money;
  }
  return { amount: null, currency };
}

function accountRows(result: unknown): Record<string, unknown>[] {
  const record = asRecord(result);
  if (!record) return [];
  const lists = [
    record.accountAmountList,
    record.balanceInfoList,
    record.accountList,
    record.amountList,
  ];
  for (const list of lists) {
    if (Array.isArray(list)) {
      return list.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
    }
  }
  return [record];
}

function pickAccount(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  const gbp = rows.find((row) => {
    const currency = String(row.currency ?? row.currencyType ?? "").toUpperCase();
    return currency === "GBP";
  });
  return gbp ?? rows[0] ?? null;
}

export async function getTemuBalance(
  credentials: TemuCredentials,
): Promise<TemuBalanceSummary> {
  const result = await temuCall<unknown>(
    credentials,
    "temu.pay.account.amount.query",
    {},
  );
  const account = pickAccount(accountRows(result));
  if (!account) {
    throw new Error("Temu did not return an account balance.");
  }

  const currency =
    (typeof account.currency === "string" && account.currency.trim()) ||
    (typeof account.currencyType === "string" && account.currencyType.trim()) ||
    "GBP";
  const available = firstMoney(
    account,
    ["availableAmount", "availableBalance", "available"],
    currency,
  );
  const onHold = firstMoney(
    account,
    ["frozenAmount", "waitSettleBalance", "pendingAmount", "onHoldAmount", "onHold"],
    available.currency,
  );
  const total = firstMoney(
    account,
    ["totalAmount", "totalBalance", "total"],
    available.currency,
  );

  if (available.amount == null && total.amount == null) {
    throw new Error("Temu returned a balance response without an amount.");
  }

  return {
    currency: available.currency || total.currency || currency,
    available,
    onHold,
    total:
      total.amount != null
        ? total
        : {
            amount:
              available.amount == null
                ? null
                : available.amount + (onHold.amount ?? 0),
            currency: available.currency,
          },
  };
}
