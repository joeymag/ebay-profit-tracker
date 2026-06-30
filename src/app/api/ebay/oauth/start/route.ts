import { randomUUID } from "crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildEbayAuthorizeUrl } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";

const STATE_COOKIE = "ebay_oauth_state";

export async function GET() {
  const config = getEbayConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing eBay credentials. Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME to .env.local.",
      },
      { status: 400 },
    );
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const authorizeUrl = buildEbayAuthorizeUrl(state);
  return NextResponse.redirect(authorizeUrl);
}
