import { NextResponse } from "next/server";

import { getStoredQuickbooksConnection } from "@/lib/quickbooks/token-store";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 400 },
    );
  }

  const connection = await getStoredQuickbooksConnection();
  if (!connection) {
    return NextResponse.json({
      ok: true,
      connected: false,
      transactions: [],
    });
  }

  const daysRaw = Number.parseInt(
    new URL(request.url).searchParams.get("days") ?? "90",
    10,
  );
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 90;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("quickbooks_transactions")
    .select(
      "id, txn_date, txn_type, doc_number, name, memo, account_name, split_account, amount, synced_at",
    )
    .eq("realm_id", connection.realmId)
    .gte("txn_date", start.toISOString().slice(0, 10))
    .order("txn_date", { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    connected: true,
    companyName: connection.companyName,
    transactions: data ?? [],
  });
}
