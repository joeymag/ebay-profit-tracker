import {
  EBAY_APPLICATION_SCOPE,
  EBAY_FINANCES_SCOPE,
  getEbayConfig,
} from "@/lib/ebay/config";
import {
  getStoredEbayRefreshToken,
  saveEbayRefreshToken,
} from "@/lib/ebay/token-store";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
let appTokenCache: TokenCache | null = null;

export function clearEbayTokenCache() {
  tokenCache = null;
  appTokenCache = null;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
};

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const { clientId, clientSecret, apiBaseUrl } = getEbayConfig();
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required.");
  }

  const response = await fetch(`${apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(clientId, clientSecret),
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `eBay token request failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  return JSON.parse(text) as TokenResponse;
}

export function buildEbayAuthorizeUrl(state: string): string {
  const { clientId, ruName, authBaseUrl } = getEbayConfig();
  if (!clientId || !ruName) {
    throw new Error("EBAY_CLIENT_ID and EBAY_RU_NAME are required.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: ruName,
    scope: EBAY_FINANCES_SCOPE,
    state,
  });

  return `${authBaseUrl}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeEbayAuthorizationCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const { ruName } = getEbayConfig();
  if (!ruName) {
    throw new Error("EBAY_RU_NAME is required.");
  }

  const data = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: ruName,
    }),
  );

  if (!data.refresh_token) {
    throw new Error("eBay did not return a refresh token.");
  }

  await saveEbayRefreshToken(data.refresh_token);
  clearEbayTokenCache();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function getEbayAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const refreshToken = await getStoredEbayRefreshToken();
  if (!refreshToken) {
    throw new Error(
      "eBay is not connected. Authorize in Settings → eBay Finances API.",
    );
  }

  const data = await requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: EBAY_FINANCES_SCOPE,
    }),
  );

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  if (data.refresh_token) {
    await saveEbayRefreshToken(data.refresh_token);
  }

  return data.access_token;
}

export async function getEbayApplicationAccessToken(): Promise<string> {
  const now = Date.now();
  if (appTokenCache && appTokenCache.expiresAt > now + 60_000) {
    return appTokenCache.accessToken;
  }

  const data = await requestToken(
    new URLSearchParams({
      grant_type: "client_credentials",
      scope: EBAY_APPLICATION_SCOPE,
    }),
  );

  appTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}
