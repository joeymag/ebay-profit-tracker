import { NextResponse } from "next/server";

import { getAmazonConfig } from "@/lib/amazon/config";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";

export async function GET() {
  const config = getAmazonConfig();
  const refreshToken = await getStoredAmazonRefreshToken();
  const warnings: string[] = [];

  if (process.env.VERCEL && !hasSupabaseServiceRoleKey()) {
    warnings.push(
      "SUPABASE_SERVICE_ROLE_KEY is missing on Vercel. Amazon refresh tokens cannot be saved.",
    );
  }

  if (config.env === "sandbox") {
    warnings.push(
      "AMAZON_ENV is sandbox — API responses are mocked. Set AMAZON_ENV=production for live seller data.",
    );
  }

  return NextResponse.json({
    ok: true,
    env: config.env,
    region: config.region,
    marketplaceId: config.marketplaceId,
    warnings,
    hasClientId: Boolean(config.clientId),
    hasClientSecret: Boolean(config.clientSecret),
    hasSupabaseServiceRoleKey: hasSupabaseServiceRoleKey(),
    isConfigured: config.isConfigured,
    isConnected: Boolean(refreshToken),
  });
}
