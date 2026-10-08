import { NextResponse } from "next/server";

import { getQuickbooksConfig } from "@/lib/quickbooks/config";
import { getStoredQuickbooksConnection } from "@/lib/quickbooks/token-store";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";

export async function GET() {
  const config = getQuickbooksConfig();
  const connection = await getStoredQuickbooksConnection();

  return NextResponse.json({
    ok: true,
    env: config.env,
    isConfigured: config.isConfigured,
    hasClientId: Boolean(config.clientId),
    hasClientSecret: Boolean(config.clientSecret),
    hasSupabaseServiceRoleKey: hasSupabaseServiceRoleKey(),
    isConnected: Boolean(connection),
    companyName: connection?.companyName ?? null,
    realmId: connection?.realmId ?? null,
    updatedAt: connection?.updatedAt ?? null,
  });
}
