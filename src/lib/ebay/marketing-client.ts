import { getEbayAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";

export async function ebayMarketingFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { marketingBaseUrl } = getEbayConfig();
  const accessToken = await getEbayAccessToken();
  const url = `${marketingBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const method = init?.method?.toUpperCase() ?? "GET";

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");
  if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    method,
    cache: "no-store",
    headers,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new EbayApiError(
      `eBay Marketing API error (${response.status})`,
      response.status,
      text,
    );
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}
