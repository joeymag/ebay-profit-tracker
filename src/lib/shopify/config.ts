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

/** Store handle for admin.shopify.com/store/{handle}/... URLs. */
export function getShopifyAdminStoreHandle() {
  const host = getShopifyStoreHost();
  if (!host) {
    return null;
  }
  const match = host.match(/^([^.]+)\.myshopify\.com$/i);
  return match?.[1] ?? null;
}

export function getShopifyOrderAdminUrl(shopifyOrderId: number) {
  const host = getShopifyStoreHost();
  if (!host || !Number.isFinite(shopifyOrderId)) {
    return null;
  }
  const handle = getShopifyAdminStoreHandle();
  if (handle) {
    return `https://admin.shopify.com/store/${handle}/orders/${shopifyOrderId}`;
  }
  return `https://${host}/admin/orders/${shopifyOrderId}`;
}

/**
 * Opens the order in Shopify Admin where merchants can click
 * "Create shipping label" and see carrier + price (Evri, DPD, etc.).
 */
export function getShopifyCreateShippingLabelUrl(shopifyOrderId: number) {
  return getShopifyOrderAdminUrl(shopifyOrderId);
}

export function getShopifyProductAdminUrl(productId: number) {
  const host = getShopifyStoreHost();
  if (!host) {
    return null;
  }
  return `https://${host}/admin/products/${productId}`;
}

/** Public website origin for product pages (QR codes / customer links). */
export function getShopifyStorefrontOrigin() {
  const fromEnv =
    process.env.PACK_SHEET_WEBSITE?.trim() ||
    process.env.SHOPIFY_STOREFRONT_URL?.trim() ||
    process.env.PRODUCT_LABEL_WEBSITE?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  const host = getShopifyStoreHost();
  if (host && !host.toLowerCase().endsWith(".myshopify.com")) {
    return `https://${host}`;
  }

  return "https://tstrade.co.uk";
}

export function getShopifyStorefrontProductUrl(productHandle: string) {
  const handle = productHandle.trim();
  if (!handle) {
    return null;
  }
  return `${getShopifyStorefrontOrigin()}/products/${handle}`;
}
