import { NextResponse } from "next/server";

import { clearAmazonTokenCache } from "@/lib/amazon/auth";
import { clearStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export async function POST() {
  await clearStoredAmazonRefreshToken();
  clearAmazonTokenCache();

  return NextResponse.json({ ok: true });
}
