import { NextResponse } from "next/server";

import { clearEbayTokenCache } from "@/lib/ebay/auth";
import { clearStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export async function POST() {
  await clearStoredEbayRefreshToken();
  clearEbayTokenCache();

  return NextResponse.json({ ok: true });
}
