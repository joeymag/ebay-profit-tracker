import {
  clearShopifyTokenCache,
  getShopifyAccessToken,
} from "@/lib/shopify/auth";
import {
  getShopifyAdminBaseUrl,
  getShopifyConfig,
} from "@/lib/shopify/config";

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

type ShopifyFetchResult = {
  text: string;
  linkHeader: string | null;
};

async function shopifyAdminRequest(
  path: string,
  init?: RequestInit,
): Promise<ShopifyFetchResult> {
  const { storeDomain, apiVersion, isConfigured } = getShopifyConfig();

  if (!isConfigured || !storeDomain) {
    throw new Error(
      "Shopify is not configured. See .env.example for required variables.",
    );
  }

  const baseUrl = getShopifyAdminBaseUrl(storeDomain, apiVersion);
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  async function requestWithToken(retryAfterRefresh: boolean): Promise<ShopifyFetchResult> {
    const accessToken = await getShopifyAccessToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
        ...init?.headers,
      },
    });
    const text = await response.text();
    const linkHeader = response.headers.get("link");

    if (response.status === 403 && retryAfterRefresh) {
      clearShopifyTokenCache();
      return requestWithToken(false);
    }

    if (!response.ok) {
      throw new ShopifyApiError(
        `Shopify API error (${response.status})`,
        response.status,
        text,
      );
    }

    return { text, linkHeader };
  }

  return requestWithToken(true);
}

export async function shopifyAdminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { text } = await shopifyAdminRequest(path, init);

  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export async function shopifyAdminFetchWithLink<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; linkHeader: string | null }> {
  const { text, linkHeader } = await shopifyAdminRequest(path, init);
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  return { data, linkHeader };
}

export type ShopifyShopResponse = {
  shop: {
    id: number;
    name: string;
    email: string;
    domain: string;
    myshopify_domain: string;
    currency: string;
    plan_name: string;
  };
};

export async function testShopifyConnection() {
  const data = await shopifyAdminFetch<ShopifyShopResponse>("/shop.json");
  return {
    shopName: data.shop.name,
    domain: data.shop.myshopify_domain,
    currency: data.shop.currency,
    plan: data.shop.plan_name,
  };
}
