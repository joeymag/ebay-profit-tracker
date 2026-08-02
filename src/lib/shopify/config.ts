/**
 * Shopify Admin API configuration.
 * Supports store custom app token (shpat_) or Partners app client credentials.
 */

export function normalizeShopifyDomain(storeDomain: string) {
  return storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function getShopifyConfig() {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN?.trim();
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2025-01";

  const hasDirectToken = Boolean(accessToken && !accessToken.startsWith("shpss_"));
  const hasClientCredentials = Boolean(clientId && clientSecret);
  const hasMisplacedSecret =
    Boolean(accessToken?.startsWith("shpss_")) && !clientSecret;

  return {
    storeDomain,
    accessToken,
    clientId,
    clientSecret,
    apiVersion,
    hasDirectToken,
    hasClientCredentials,
    hasMisplacedSecret,
    isConfigured:
      Boolean(storeDomain) && (hasDirectToken || hasClientCredentials),
  };
}

export function getShopifyAdminBaseUrl(storeDomain: string, apiVersion: string) {
  const host = normalizeShopifyDomain(storeDomain);
  return `https://${host}/admin/api/${apiVersion}`;
}

export function getShopifyStoreHost() {
  const { storeDomain } = getShopifyConfig();
  return storeDomain ? normalizeShopifyDomain(storeDomain) : null;
}

export function getShopifyProductAdminUrl(productId: number) {
  const host = getShopifyStoreHost();
  if (!host) {
    return null;
  }
  return `https://${host}/admin/products/${productId}`;
}

export function getShopifyStorefrontProductUrl(productHandle: string) {
  const host = getShopifyStoreHost();
  const handle = productHandle.trim();
  if (!host || !handle) {
    return null;
  }
  return `https://${host}/products/${handle}`;
}
