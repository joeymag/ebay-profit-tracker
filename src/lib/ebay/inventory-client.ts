import { getEbayAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";

type InventoryItemResponse = Record<string, unknown>;

/** eBay Inventory LocaleEnum — single value only (no q-weights). */
function ebayInventoryLocale(marketplaceId: string): string {
  switch (marketplaceId.trim().toUpperCase()) {
    case "EBAY_US":
    case "EBAY_MOTORS_US":
      return "en-US";
    case "EBAY_GB":
      return "en-GB";
    case "EBAY_DE":
      return "de-DE";
    case "EBAY_FR":
      return "fr-FR";
    case "EBAY_IT":
      return "it-IT";
    case "EBAY_ES":
      return "es-ES";
    case "EBAY_AU":
      return "en-AU";
    case "EBAY_CA":
      return "en-CA";
    default:
      return "en-GB";
  }
}

export async function ebayInventoryFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { apiBaseUrl, marketplaceId } = getEbayConfig();
  const accessToken = await getEbayAccessToken();
  const url = `${apiBaseUrl}/sell/inventory/v1${path.startsWith("/") ? path : `/${path}`}`;
  const method = init?.method?.toUpperCase() ?? "GET";
  const locale = ebayInventoryLocale(marketplaceId);

  // Build headers last so we override any Accept-Language Next.js may forward
  // from the browser (e.g. "en-GB,en;q=0.9"), which eBay rejects with 25709.
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");
  headers.set("Accept-Language", locale);

  if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
    headers.set("Content-Type", "application/json");
    headers.set("Content-Language", locale);
  } else {
    headers.delete("Content-Language");
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
      `eBay Inventory API error (${response.status})`,
      response.status,
      text,
    );
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function updateInventoryItemTitle(
  sku: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const encodedSku = encodeURIComponent(sku.trim());
    const existing = await ebayInventoryFetch<InventoryItemResponse>(
      `/inventory_item/${encodedSku}`,
    );

    const product =
      existing.product && typeof existing.product === "object"
        ? { ...(existing.product as Record<string, unknown>) }
        : {};

    product.title = title.trim();

    const payload: InventoryItemResponse = {
      ...existing,
      product,
    };

    delete payload.sku;

    await ebayInventoryFetch(`/inventory_item/${encodedSku}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof EbayApiError
        ? error.body?.slice(0, 300) ?? error.message
        : error instanceof Error
          ? error.message
          : "Could not update title on eBay";

    return { ok: false, error: message };
  }
}
