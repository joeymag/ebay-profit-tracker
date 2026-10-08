import { randomUUID } from "crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import { buildQuickbooksAuthorizeUrl } from "@/lib/quickbooks/auth";
import { getQuickbooksConfig } from "@/lib/quickbooks/config";

const STATE_COOKIE = "quickbooks_oauth_state";

export async function GET(request: Request) {
  const config = getQuickbooksConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET before connecting.",
      },
      { status: 400 },
    );
  }

  const origin = getAppUrl() ?? new URL(request.url).origin;
  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildQuickbooksAuthorizeUrl(state, origin));
}
