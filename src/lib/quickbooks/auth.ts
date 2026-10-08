import {
  getQuickbooksConfig,
  QUICKBOOKS_ACCOUNTING_SCOPE,
  quickbooksRedirectUri,
} from "@/lib/quickbooks/config";
import { QuickbooksApiError } from "@/lib/quickbooks/errors";
import {
  getStoredQuickbooksConnection,
  saveQuickbooksConnection,
} from "@/lib/quickbooks/token-store";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

function basicAuthHeader(): string {
  const { clientId, clientSecret } = getQuickbooksConfig();
  if (!clientId || !clientSecret) {
    throw new Error("QuickBooks client id and secret are not configured.");
  }
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const { tokenUrl } = getQuickbooksConfig();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new QuickbooksApiError(
      `QuickBooks token error (${response.status})`,
      response.status,
      text,
    );
  }

  return text ? (JSON.parse(text) as TokenResponse) : {};
}

function expiresAtFromSeconds(seconds: number | undefined): string {
  const lifetime = Math.max(60, seconds ?? 3600);
  return new Date(Date.now() + (lifetime - 60) * 1000).toISOString();
}

export function buildQuickbooksAuthorizeUrl(state: string, origin: string): string {
  const { authUrl, clientId } = getQuickbooksConfig();
  if (!clientId) {
    throw new Error("QUICKBOOKS_CLIENT_ID is not configured.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: QUICKBOOKS_ACCOUNTING_SCOPE,
    redirect_uri: quickbooksRedirectUri(origin),
    state,
  });

  return `${authUrl}?${params.toString()}`;
}

export async function exchangeQuickbooksAuthorizationCode(
  code: string,
  realmId: string,
  origin: string,
): Promise<void> {
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: quickbooksRedirectUri(origin),
    }),
  );

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("QuickBooks did not return tokens.");
  }

  await saveQuickbooksConnection({
    realmId,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    accessExpiresAt: expiresAtFromSeconds(tokens.expires_in),
  });
}

export async function getQuickbooksAccessToken(): Promise<{
  accessToken: string;
  realmId: string;
}> {
  const stored = await getStoredQuickbooksConnection();
  if (!stored) {
    throw new Error("QuickBooks is not connected.");
  }

  const stillValid =
    stored.accessToken &&
    stored.accessExpiresAt &&
    Date.parse(stored.accessExpiresAt) > Date.now();

  if (stillValid && stored.accessToken) {
    return { accessToken: stored.accessToken, realmId: stored.realmId };
  }

  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
    }),
  );

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("QuickBooks token refresh failed. Reconnect QuickBooks.");
  }

  const accessExpiresAt = expiresAtFromSeconds(tokens.expires_in);
  await saveQuickbooksConnection({
    realmId: stored.realmId,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    accessExpiresAt,
    companyName: stored.companyName,
  });

  return { accessToken: tokens.access_token, realmId: stored.realmId };
}
