import { getShopifyConfig, normalizeShopifyDomain } from "@/lib/shopify/config";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

/** Clear cached token after scope changes or reinstall. */
export function clearShopifyTokenCache() {
  tokenCache = null;
}

type ClientCredentialsResponse = {
  access_token: string;
  scope: string;
  expires_in: number;
};

/**
 * Resolves an Admin API access token:
 * - Direct `shpat_` token in SHOPIFY_ADMIN_API_ACCESS_TOKEN, or
 * - Client credentials (Partners app Client ID + Secret `shpss_`).
 */
export async function getShopifyAccessToken(): Promise<string> {
  const { storeDomain, accessToken, clientId, clientSecret } = getShopifyConfig();

  if (!storeDomain) {
    throw new Error("SHOPIFY_STORE_DOMAIN is required.");
  }

  if (accessToken && !accessToken.startsWith("shpss_")) {
    return accessToken;
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (Partners app), or a store Admin API token (shpat_) in SHOPIFY_ADMIN_API_ACCESS_TOKEN.",
    );
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const host = normalizeShopifyDomain(storeDomain);
  const response = await fetch(`https://${host}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Could not exchange Client ID + Secret for an access token (${response.status}). Is the app installed on ${host}?`,
    );
  }

  const data = JSON.parse(text) as ClientCredentialsResponse;

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}
