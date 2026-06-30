import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exchangeEbayAuthorizationCode } from "@/lib/ebay/auth";

const STATE_COOKIE = "ebay_oauth_state";

function settingsRedirect(request: Request, params: Record<string, string>) {
  const origin = new URL(request.url).origin;
  const search = new URLSearchParams(params);
  return NextResponse.redirect(new URL(`/settings?${search.toString()}`, origin));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return settingsRedirect(request, {
      ebay: "error",
      message: errorDescription ?? error,
    });
  }

  if (!code || !state) {
    return settingsRedirect(request, {
      ebay: "error",
      message: "Missing authorization code from eBay.",
    });
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!expectedState || expectedState !== state) {
    return settingsRedirect(request, {
      ebay: "error",
      message: "OAuth state mismatch. Try connecting again.",
    });
  }

  try {
    await exchangeEbayAuthorizationCode(code);
    return settingsRedirect(request, { ebay: "connected" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not complete eBay authorization.";
    return settingsRedirect(request, { ebay: "error", message });
  }
}
