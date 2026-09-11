export type AmazonEnvironment = "sandbox" | "production";
export type AmazonRegion = "na" | "eu" | "fe";

/** Amazon.co.uk marketplace (default for this store). */
export const AMAZON_MARKETPLACE_UK = "A1F83G8C2ARO7P";

const REGION_ENDPOINTS: Record<
  AmazonRegion,
  { production: string; sandbox: string }
> = {
  na: {
    production: "https://sellingpartnerapi-na.amazon.com",
    sandbox: "https://sandbox.sellingpartnerapi-na.amazon.com",
  },
  eu: {
    production: "https://sellingpartnerapi-eu.amazon.com",
    sandbox: "https://sandbox.sellingpartnerapi-eu.amazon.com",
  },
  fe: {
    production: "https://sellingpartnerapi-fe.amazon.com",
    sandbox: "https://sandbox.sellingpartnerapi-fe.amazon.com",
  },
};

export function getAmazonConfig() {
  const clientId = process.env.AMAZON_CLIENT_ID?.trim();
  const clientSecret = process.env.AMAZON_CLIENT_SECRET?.trim();
  // Default production — private seller apps use live LWA keys.
  // Set AMAZON_ENV=sandbox only when intentionally testing mocked APIs.
  const envRaw = process.env.AMAZON_ENV?.trim().toLowerCase();
  const env = (envRaw === "sandbox" ? "sandbox" : "production") as AmazonEnvironment;
  const regionRaw = process.env.AMAZON_REGION?.trim().toLowerCase();
  const region = (
    regionRaw === "na" || regionRaw === "fe" ? regionRaw : "eu"
  ) as AmazonRegion;
  const isSandbox = env === "sandbox";
  const endpoints = REGION_ENDPOINTS[region];

  return {
    clientId,
    clientSecret,
    env,
    region,
    isSandbox,
    isConfigured: Boolean(clientId && clientSecret),
    lwaTokenUrl: "https://api.amazon.com/auth/o2/token",
    apiBaseUrl: isSandbox ? endpoints.sandbox : endpoints.production,
    marketplaceId:
      process.env.AMAZON_MARKETPLACE_ID?.trim() || AMAZON_MARKETPLACE_UK,
    userAgent:
      process.env.AMAZON_USER_AGENT?.trim() ||
      "TSTradeProfitTracker/1.0 (Language=TypeScript)",
  };
}
