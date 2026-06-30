import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase env vars missing in .env.local" },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("orders").select("shopify_id").limit(1);

    if (!error) {
      return NextResponse.json({
        ok: true,
        tablesReady: true,
        message: "Orders tables exist. You can sync or import orders.",
      });
    }

    const sqlPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "001_orders_schema.sql",
    );
    const sql = readFileSync(sqlPath, "utf8");

    return NextResponse.json({
      ok: true,
      tablesReady: false,
      message:
        "Tables not found. Run the SQL below in Supabase → SQL Editor, then retry import.",
      sql,
      sqlEditorUrl:
        "https://supabase.com/dashboard/project/_/sql/new",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
