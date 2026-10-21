import type { AccountPayment } from "@/lib/accounting/payments";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type PaymentChannel = "ebay" | "amazon" | "temu";

type PaymentRow = {
  channel: string;
  external_id: string;
  paid_at: string | null;
  txn_type: string | null;
  status: string | null;
  reference: string | null;
  description: string | null;
  batch_id: string | null;
  product_charges: number | null;
  other_amount: number | null;
  amount: number | null;
  currency: string;
  synced_at: string;
};

function toPayment(row: PaymentRow): AccountPayment {
  return {
    id: row.external_id,
    date: row.paid_at ?? row.synced_at,
    type: row.txn_type ?? "Payment",
    status: row.status ?? "Posted",
    reference: row.reference,
    description: row.description ?? "",
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency || "GBP",
    batchId: row.batch_id,
    productCharges: row.product_charges == null ? null : Number(row.product_charges),
    otherAmount: row.other_amount == null ? null : Number(row.other_amount),
  };
}

function toRow(channel: PaymentChannel, payment: AccountPayment, syncedAt: string): PaymentRow | null {
  const externalId = payment.id.trim();
  if (!externalId) return null;
  const paidAt = new Date(payment.date);
  return {
    channel,
    external_id: externalId,
    paid_at: Number.isFinite(paidAt.getTime()) ? paidAt.toISOString() : null,
    txn_type: payment.type,
    status: payment.status,
    reference: payment.reference,
    description: payment.description,
    batch_id: payment.batchId ?? null,
    product_charges: payment.productCharges ?? null,
    other_amount: payment.otherAmount ?? null,
    amount: payment.amount,
    currency: payment.currency || "GBP",
    synced_at: syncedAt,
  };
}

async function readStored(channel: PaymentChannel): Promise<{
  payments: AccountPayment[];
  syncedAt: string | null;
}> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("marketplace_payments")
    .select(
      "channel, external_id, paid_at, txn_type, status, reference, description, batch_id, product_charges, other_amount, amount, currency, synced_at",
    )
    .eq("channel", channel)
    .order("paid_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PaymentRow[];
  const syncedAt = rows.reduce<string | null>((latest, row) => {
    if (!latest || row.synced_at > latest) return row.synced_at;
    return latest;
  }, null);
  return { payments: rows.map(toPayment), syncedAt };
}

export async function saveMarketplacePayments(
  channel: PaymentChannel,
  payments: AccountPayment[],
): Promise<string> {
  return savePayments(channel, payments);
}

async function savePayments(channel: PaymentChannel, payments: AccountPayment[]): Promise<string> {
  const syncedAt = new Date().toISOString();
  const rows = payments
    .map((payment) => toRow(channel, payment, syncedAt))
    .filter((row): row is PaymentRow => row != null);
  const supabase = createSupabaseAdmin();
  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    const { error } = await supabase
      .from("marketplace_payments")
      .upsert(chunk, { onConflict: "channel,external_id" });
    if (error) throw new Error(error.message);
  }
  return syncedAt;
}

export async function loadMarketplacePayments(options: {
  channel: PaymentChannel;
  refresh: boolean;
  loadFresh: () => Promise<{ payments: AccountPayment[]; warning: string | null }>;
}): Promise<{
  payments: AccountPayment[];
  warning: string | null;
  syncedAt: string | null;
  fromCache: boolean;
}> {
  if (!options.refresh && isSupabaseConfigured()) {
    try {
      const stored = await readStored(options.channel);
      if (stored.payments.length > 0) {
        return { ...stored, warning: null, fromCache: true };
      }
    } catch {
      // Fall through and load from the marketplace when the table is not ready.
    }
  }

  const fresh = await options.loadFresh();
  let syncedAt: string | null = null;
  let warning = fresh.warning;
  if (isSupabaseConfigured() && fresh.payments.length > 0) {
    try {
      syncedAt = await savePayments(options.channel, fresh.payments);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not store payments.";
      warning = warning ?? message;
    }
  }
  return {
    payments: fresh.payments,
    warning,
    syncedAt,
    fromCache: false,
  };
}
