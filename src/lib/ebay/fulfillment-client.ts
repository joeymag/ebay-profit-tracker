import { getEbayAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import { ebayOrderIdLookupVariants } from "@/lib/ebay/order-id";

export type EbayShippingFulfillment = {
  fulfillmentId?: string;
  shipmentTrackingNumber?: string;
  shippingCarrierCode?: string;
  shippedDate?: string;
};

export type EbayShippingFulfillmentsResponse = {
  fulfillments?: EbayShippingFulfillment[];
  total?: number;
};

export async function ebayFulfillmentFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; status: number }> {
  const { fulfillmentBaseUrl, marketplaceId } = getEbayConfig();
  const accessToken = await getEbayAccessToken();
  const url = `${fulfillmentBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new EbayApiError(
      `eBay Fulfillment API error (${response.status})`,
      response.status,
      text,
    );
  }

  return {
    status: response.status,
    data: text ? (JSON.parse(text) as T) : ({} as T),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getEbayShippingFulfillments(
  ebayOrderId: string,
): Promise<EbayShippingFulfillment[]> {
  const variants = ebayOrderIdLookupVariants(ebayOrderId);

  for (let index = 0; index < variants.length; index += 1) {
    const orderId = encodeURIComponent(variants[index]!);
    try {
      const { data, status } =
        await ebayFulfillmentFetch<EbayShippingFulfillmentsResponse>(
          `/order/${orderId}/shipping_fulfillment`,
        );
      if (status === 204) {
        continue;
      }
      const fulfillments = data.fulfillments ?? [];
      if (fulfillments.length > 0) {
        return fulfillments;
      }
    } catch (error) {
      if (error instanceof EbayApiError && (error.status === 404 || error.status === 400)) {
        // Try next ID format.
      } else {
        throw error;
      }
    }

    if (index < variants.length - 1) {
      await sleep(120);
    }
  }

  return [];
}

/** Map eBay carrier codes to our dashboard labels. */
export function normalizeEbayCarrierCode(
  code: string | null | undefined,
): string | null {
  const raw = code?.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (
    upper.includes("ROYAL") ||
    upper === "RM" ||
    upper === "ROYAL_MAIL" ||
    upper.startsWith("RM_")
  ) {
    return "Royal Mail";
  }
  if (upper.includes("EVRI") || upper.includes("HERMES")) {
    return "Evri";
  }
  if (upper.includes("PARCELFORCE") || upper === "PF") {
    return "Parcelforce";
  }
  if (upper.includes("DPD")) return "DPD";
  if (upper.includes("YODEL")) return "Yodel";
  if (upper.includes("UPS")) return "UPS";
  if (upper.includes("FEDEX")) return "FedEx";
  if (upper.includes("DHL")) return "DHL";
  return raw;
}
