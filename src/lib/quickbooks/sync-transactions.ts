import {
  fetchQuickbooksCompanyName,
  fetchTransactionListReport,
  type QuickbooksReport,
  type QuickbooksReportRow,
} from "@/lib/quickbooks/client";
import {
  getStoredQuickbooksConnection,
  updateQuickbooksCompanyName,
} from "@/lib/quickbooks/token-store";
import { createSupabaseAdmin } from "@/lib/supabase/client";

export type QuickbooksTransactionRow = {
  id: string;
  realm_id: string;
  txn_key: string;
  txn_date: string;
  txn_type: string | null;
  doc_number: string | null;
  name: string | null;
  memo: string | null;
  account_name: string | null;
  split_account: string | null;
  amount: number;
  synced_at: string;
};

export type SyncQuickbooksResult = {
  ok: true;
  days: number;
  imported: number;
  companyName: string | null;
  syncedAt: string;
};

const COLUMN_ALIASES: Record<string, keyof ParsedTxn | "skip"> = {
  date: "txnDate",
  "transaction type": "txnType",
  "transaction_type": "txnType",
  num: "docNumber",
  "doc num": "docNumber",
  no: "docNumber",
  name: "name",
  "memo/description": "memo",
  memo: "memo",
  description: "memo",
  account: "accountName",
  split: "splitAccount",
  amount: "amount",
};

type ParsedTxn = {
  txnDate: string;
  txnType: string | null;
  txnId: string | null;
  docNumber: string | null;
  name: string | null;
  memo: string | null;
  accountName: string | null;
  splitAccount: string | null;
  amount: number;
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseAmount(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const normalized = value.replace(/,/g, "").replace(/[£$€]/g, "").trim();
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function columnIndex(report: QuickbooksReport): Map<string, number> {
  const map = new Map<string, number>();
  const columns = report.Columns?.Column ?? [];
  columns.forEach((column, index) => {
    const title = column.ColTitle?.trim().toLowerCase();
    if (title) {
      map.set(title, index);
    }
  });
  return map;
}

function collectDataRows(rows: QuickbooksReportRow[] | undefined, into: QuickbooksReportRow[]) {
  for (const row of rows ?? []) {
    if (row.type === "Data" && row.ColData?.length) {
      into.push(row);
    }
    if (row.Rows?.Row?.length) {
      collectDataRows(row.Rows.Row, into);
    }
  }
}

function parseTransactions(
  report: QuickbooksReport,
  realmId: string,
  syncedAt: string,
): QuickbooksTransactionRow[] {
  const indexes = columnIndex(report);
  const dataRows: QuickbooksReportRow[] = [];
  collectDataRows(report.Rows?.Row, dataRows);

  const seen = new Set<string>();
  const parsed: QuickbooksTransactionRow[] = [];

  for (const row of dataRows) {
    const cells = row.ColData ?? [];
    const draft: Partial<ParsedTxn> = {};
    let txnId: string | null = null;

    for (const [title, index] of indexes) {
      const field = COLUMN_ALIASES[title];
      if (!field || field === "skip") continue;
      const cell = cells[index];
      if (field === "txnType") {
        draft.txnType = clean(cell?.value);
        txnId = clean(cell?.id);
      } else if (field === "amount") {
        const amount = parseAmount(cell?.value);
        if (amount != null) draft.amount = amount;
      } else if (field === "txnDate") {
        const date = clean(cell?.value);
        if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
          draft.txnDate = date.slice(0, 10);
        }
      } else {
        draft[field] = clean(cell?.value);
      }
    }

    if (!draft.txnDate || draft.amount == null) {
      continue;
    }

    const txnKey = txnId
      ? `${draft.txnType ?? "txn"}:${txnId}`
      : [
          draft.txnDate,
          draft.txnType ?? "",
          draft.docNumber ?? "",
          draft.name ?? "",
          draft.memo ?? "",
          draft.accountName ?? "",
          draft.amount.toFixed(2),
        ].join("|");

    if (seen.has(txnKey)) continue;
    seen.add(txnKey);

    parsed.push({
      id: `${realmId}:${txnKey}`,
      realm_id: realmId,
      txn_key: txnKey,
      txn_date: draft.txnDate,
      txn_type: draft.txnType ?? null,
      doc_number: draft.docNumber ?? null,
      name: draft.name ?? null,
      memo: draft.memo ?? null,
      account_name: draft.accountName ?? null,
      split_account: draft.splitAccount ?? null,
      amount: draft.amount,
      synced_at: syncedAt,
    });
  }

  return parsed;
}

export async function syncQuickbooksTransactions(options?: {
  days?: number;
}): Promise<SyncQuickbooksResult> {
  const connection = await getStoredQuickbooksConnection();
  if (!connection) {
    throw new Error("QuickBooks is not connected.");
  }

  const days = Math.min(Math.max(options?.days ?? 90, 1), 365);
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const syncedAt = new Date().toISOString();

  let companyName = connection.companyName;
  if (!companyName) {
    try {
      companyName = await fetchQuickbooksCompanyName(connection.realmId);
      if (companyName) {
        await updateQuickbooksCompanyName(companyName);
      }
    } catch {
      companyName = null;
    }
  }

  const report = await fetchTransactionListReport(startDate, endDate);
  const rows = parseTransactions(report, connection.realmId, syncedAt);
  const supabase = createSupabaseAdmin();

  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    const { error } = await supabase
      .from("quickbooks_transactions")
      .upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    ok: true,
    days,
    imported: rows.length,
    companyName,
    syncedAt,
  };
}
