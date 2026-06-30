import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

function credentialKind(value: string | undefined): "production" | "sandbox" | "unknown" {
  const normalized = value?.toUpperCase() ?? "";
  if (normalized.includes("PRD") || normalized.includes("-PR-")) {
    return "production";
  }
  if (normalized.includes("SBX") || normalized.includes("-SB-")) {
    return "sandbox";
  }
  return "unknown";
}

export async function GET() {
  const config = getEbayConfig();
  const refreshToken = await getStoredEbayRefreshToken();
  const clientKind = credentialKind(config.clientId);
  const ruNameKind = credentialKind(config.ruName);
  const warnings: string[] = [];

  if (config.env === "production" && clientKind === "sandbox") {
    warnings.push(
      "EBAY_ENV is production but EBAY_CLIENT_ID looks like a Sandbox App ID.",
    );
  }
  if (config.env === "sandbox" && clientKind === "production") {
    warnings.push(
      "EBAY_ENV is sandbox but EBAY_CLIENT_ID looks like a Production App ID. This causes unauthorized_client errors.",
    );
  }
  if (config.env === "production" && ruNameKind === "sandbox") {
    warnings.push("EBAY_RU_NAME looks like a Sandbox RuName but EBAY_ENV is production.");
  }
  if (config.env === "sandbox" && ruNameKind === "production") {
    warnings.push("EBAY_RU_NAME looks like a Production RuName but EBAY_ENV is sandbox.");
  }

  return NextResponse.json({
    ok: true,
    env: config.env,
    clientKind,
    ruNameKind,
    warnings,
    hasClientId: Boolean(config.clientId),
    hasClientSecret: Boolean(config.clientSecret),
    hasRuName: Boolean(config.ruName),
    isConfigured: config.isConfigured,
    isConnected: Boolean(refreshToken),
  });
}
