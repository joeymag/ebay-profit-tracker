export type EbayEnvironment = "sandbox" | "production";

export const EBAY_FINANCES_SCOPE =
  "https://api.ebay.com/oauth/api_scope/sell.finances";

export const EBAY_ANALYTICS_SCOPE =
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly";

export const EBAY_APPLICATION_SCOPE = "https://api.ebay.com/oauth/api_scope";

/** OAuth scopes requested when connecting eBay (space-separated). */
export const EBAY_OAUTH_SCOPES = [
  EBAY_FINANCES_SCOPE,
  EBAY_ANALYTICS_SCOPE,
].join(" ");

export function getEbayConfig() {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  const ruName = process.env.EBAY_RU_NAME?.trim();
  const env = (process.env.EBAY_ENV?.trim().toLowerCase() === "production"
    ? "production"
    : "sandbox") as EbayEnvironment;

  const isSandbox = env === "sandbox";

  return {
    clientId,
    clientSecret,
    ruName,
    env,
    isSandbox,
    isConfigured: Boolean(clientId && clientSecret && ruName),
    authBaseUrl: isSandbox
      ? "https://auth.sandbox.ebay.com"
      : "https://auth.ebay.com",
    apiBaseUrl: isSandbox
      ? "https://api.sandbox.ebay.com"
      : "https://api.ebay.com",
    financesBaseUrl: isSandbox
      ? "https://apiz.sandbox.ebay.com/sell/finances/v1"
      : "https://apiz.ebay.com/sell/finances/v1",
    analyticsBaseUrl: isSandbox
      ? "https://api.sandbox.ebay.com/sell/analytics/v1"
      : "https://api.ebay.com/sell/analytics/v1",
    marketplaceId:
      process.env.EBAY_MARKETPLACE?.trim().toUpperCase() || "EBAY_GB",
    keyManagementBaseUrl: isSandbox
      ? "https://apiz.sandbox.ebay.com/developer/key_management/v1"
      : "https://apiz.ebay.com/developer/key_management/v1",
    financesAuthority: isSandbox ? "apiz.sandbox.ebay.com" : "apiz.ebay.com",
  };
}
