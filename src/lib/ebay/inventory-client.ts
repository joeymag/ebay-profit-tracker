import { getEbayAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";

type InventoryItemResponse = Record<string, unknown>;

export async function ebayInventoryFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { apiBaseUrl } = getEbayConfig();
  const accessToken = await getEbayAccessToken();
  const url = `${apiBaseUrl}/sell/inventory/v1${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Content-Language": "en-GB",
      ...(init?.headers ?? {}),
    },
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
