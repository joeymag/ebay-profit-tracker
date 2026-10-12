import { NextResponse } from "next/server";

import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

export async function GET() {
  const stored = await getStoredTemuCredentials();
  const warnings: string[] = [];
  if (process.env.VERCEL && !hasSupabaseServiceRoleKey()) {
    warnings.push(
      "SUPABASE_SERVICE_ROLE_KEY is missing on Vercel. Temu keys cannot be saved.",
    );
  }

  return NextResponse.json({
    ok: true,
    warnings,
    region: stored?.region ?? "eu",
    mallId: stored?.mallId ?? null,
    isConnected: Boolean(stored),
    fromEnv: Boolean(
      process.env.TEMU_APP_KEY &&
        process.env.TEMU_APP_SECRET &&
        process.env.TEMU_ACCESS_TOKEN,
    ),
  });
}
