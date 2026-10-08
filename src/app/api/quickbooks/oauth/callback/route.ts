import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import { exchangeQuickbooksAuthorizationCode } from "@/lib/quickbooks/auth";
import { QuickbooksApiError } from "@/lib/quickbooks/errors";

const STATE_COOKIE = "quickbooks_oauth_state";

function accountingRedirect(request: Request, params: Record<string, string>) {
  const origin = getAppUrl() ?? new URL(request.url).origin;
  const search = new URLSearchParams(params);
  return NextResponse.redirect(new URL(`/accounting?${search.toString()}`, origin));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  if (error) {
    return accountingRedirect(request, {
      quickbooks: "error",
      message: error,
    });
  }

  if (!code || !state || !realmId) {
    return accountingRedirect(request, {
      quickbooks: "error",
      message: "Missing authorization details from QuickBooks.",
    });
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!expectedState || expectedState !== state) {
    return accountingRedirect(request, {
      quickbooks: "error",
      message: "QuickBooks login expired. Try connecting again.",
    });
  }

  try {
    const origin = getAppUrl() ?? url.origin;
    await exchangeQuickbooksAuthorizationCode(code, realmId, origin);
    return accountingRedirect(request, { quickbooks: "connected" });
  } catch (err) {
    const message =
      err instanceof QuickbooksApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not complete QuickBooks authorization.";
    return accountingRedirect(request, { quickbooks: "error", message });
  }
}
