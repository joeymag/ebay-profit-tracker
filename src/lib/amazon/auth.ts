import { getAmazonConfig } from "@/lib/amazon/config";
import {
  getStoredAmazonRefreshToken,
  saveAmazonRefreshToken,
} from "@/lib/amazon/token-store";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export function clearAmazonTokenCache() {
  tokenCache = null;
}

type LwaTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
};

async function requestLwaToken(
  body: URLSearchParams,
): Promise<LwaTokenResponse> {
  const { clientId, clientSecret, lwaTokenUrl } = getAmazonConfig();
  if (!clientId || !clientSecret) {
    throw new Error("AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET are required.");
  }

  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await fetch(lwaTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Amazon LWA token request failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  return JSON.parse(text) as LwaTokenResponse;
}

/**
 * Exchange a Login with Amazon refresh token for a short-lived access token.
 * @see https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api
 */
export async function getAmazonAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const refreshToken = await getStoredAmazonRefreshToken();
  if (!refreshToken) {
    throw new Error(
      "Amazon is not connected. Paste a refresh token in Settings → Amazon SP-API.",
    );
  }

  const data = await requestLwaToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );

  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await saveAmazonRefreshToken(data.refresh_token);
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}

/** Validate and store a refresh token from sandbox Create Token or Seller Central self-auth. */
export async function connectAmazonWithRefreshToken(
  refreshToken: string,
): Promise<void> {
  const trimmed = refreshToken.trim();
  if (!trimmed.startsWith("Atzr|")) {
    throw new Error(
      'Refresh token should start with "Atzr|". Copy it from Solution Provider Portal → Create Token (sandbox) or Seller Central → Authorize app.',
    );
  }

  // Prove the token works before saving.
  const data = await requestLwaToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: trimmed,
    }),
  );

  await saveAmazonRefreshToken(data.refresh_token || trimmed);
  clearAmazonTokenCache();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
