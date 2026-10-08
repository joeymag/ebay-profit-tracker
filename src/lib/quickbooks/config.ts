export type QuickbooksEnvironment = "sandbox" | "production";

export const QUICKBOOKS_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";

export function getQuickbooksConfig() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  const env = (process.env.QUICKBOOKS_ENV?.trim().toLowerCase() === "sandbox"
    ? "sandbox"
    : "production") as QuickbooksEnvironment;

  return {
    clientId,
    clientSecret,
    env,
    isSandbox: env === "sandbox",
    isConfigured: Boolean(clientId && clientSecret),
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    apiBaseUrl:
      env === "sandbox"
        ? "https://sandbox-quickbooks.api.intuit.com"
        : "https://quickbooks.api.intuit.com",
  };
}

export function quickbooksRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/quickbooks/oauth/callback`;
}
