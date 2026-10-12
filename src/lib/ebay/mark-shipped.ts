import {
  ebayFulfillmentFetch,
  getEbayShippingFulfillments,
} from "@/lib/ebay/fulfillment-client";
import { ebayOrderIdLookupVariants } from "@/lib/ebay/order-id";

type EbayOrderLine = { lineItemId?: string; quantity?: number };
type EbayOrderPayload = {
  orderId?: string;
  orderFulfillmentStatus?: string;
  lineItems?: EbayOrderLine[];
};

function ebayCarrierCode(carrier: string | null | undefined): string {
  const value = carrier?.trim().toLowerCase() ?? "";
  if (value.includes("royal")) return "RoyalMail";
  if (value.includes("evri") || value.includes("hermes")) return "Hermes";
  if (value.includes("parcel")) return "Parcelforce";
  if (value.includes("dpd")) return "DPD";
  if (value.includes("yodel")) return "Yodel";
  if (value.includes("ups")) return "UPS";
  if (value.includes("fedex")) return "FedEx";
  if (value.includes("dhl")) return "DHL";
  return "Other";
}

export async function markEbayOrderShipped(input: {
  ebayOrderId: string;
  trackingNumber: string;
  carrier?: string | null;
}): Promise<"shipped" | "already"> {
  const existing = await getEbayShippingFulfillments(input.ebayOrderId);
  if (existing.some((row) => row.shipmentTrackingNumber?.trim())) {
    return "already";
  }

  let lastError: Error | null = null;
  for (const orderId of ebayOrderIdLookupVariants(input.ebayOrderId)) {
    try {
      const { data } = await ebayFulfillmentFetch<EbayOrderPayload>(
        `/order/${encodeURIComponent(orderId)}`,
      );
      if (data.orderFulfillmentStatus === "FULFILLED") return "already";
      const lineItems = (data.lineItems ?? [])
        .filter((line) => line.lineItemId && (line.quantity ?? 0) > 0)
        .map((line) => ({
          lineItemId: line.lineItemId,
          quantity: line.quantity,
        }));
      if (lineItems.length === 0) continue;

      await ebayFulfillmentFetch(
        `/order/${encodeURIComponent(orderId)}/shipping_fulfillment`,
        {
          method: "POST",
          body: JSON.stringify({
            lineItems,
            shippedDate: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
            shippingCarrierCode: ebayCarrierCode(input.carrier),
            trackingNumber: input.trackingNumber,
          }),
        },
      );
      return "shipped";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("eBay shipment failed.");
    }
  }

  throw lastError ?? new Error("eBay order was not found.");
}
