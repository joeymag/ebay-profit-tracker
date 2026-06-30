import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export async function GET() {
  const config = getEbayConfig();
  const refreshToken = await getStoredEbayRefreshToken();

  return NextResponse.json({
    ok: true,
    env: config.env,
    hasClientId: Boolean(config.clientId),
    hasClientSecret: Boolean(config.clientSecret),
    hasRuName: Boolean(config.ruName),
    isConfigured: config.isConfigured,
    isConnected: Boolean(refreshToken),
  });
}
