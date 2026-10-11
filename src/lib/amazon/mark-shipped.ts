import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";

type AmazonOrderItem = {
  OrderItemId?: string;
  QuantityOrdered?: number;
};

function amazonCarrier(carrier: string | null | undefined): {
  carrierCode: string;
  carrierName?: string;
} {
  const value = carrier?.trim() || "Other";
  const lower = value.toLowerCase();
  if (lower.includes("royal")) return { carrierCode: "Royal Mail" };
  if (lower.includes("dpd")) return { carrierCode: "DPD" };
  if (lower.includes("ups")) return { carrierCode: "UPS" };
  if (lower.includes("fedex")) return { carrierCode: "FedEx" };
  if (lower.includes("dhl")) return { carrierCode: "DHL" };
  if (lower.includes("evri") || lower.includes("hermes")) {
    return { carrierCode: "Hermes" };
  }
  return { carrierCode: "Other", carrierName: value };
}

export async function markAmazonOrderShipped(input: {
  amazonOrderId: string;
  trackingNumber: string;
  carrier?: string | null;
}): Promise<"shipped" | "already"> {
  const { marketplaceId } = getAmazonConfig();
  const order = await amazonFetch<{
    payload?: { OrderStatus?: string };
  }>({
    path: `/orders/v0/orders/${encodeURIComponent(input.amazonOrderId)}`,
  });
  if (order.payload?.OrderStatus === "Shipped") return "already";

  const items = await amazonFetch<{
    payload?: { OrderItems?: AmazonOrderItem[] };
  }>({
    path: `/orders/v0/orders/${encodeURIComponent(input.amazonOrderId)}/orderItems`,
  });
  const orderItems = (items.payload?.OrderItems ?? [])
    .filter((item) => item.OrderItemId && (item.QuantityOrdered ?? 0) > 0)
    .map((item) => ({
      orderItemId: item.OrderItemId,
      quantity: item.QuantityOrdered,
    }));
  if (orderItems.length === 0) {
    throw new Error("Amazon order has no items to ship.");
  }

  const carrier = amazonCarrier(input.carrier);
  try {
    await amazonFetch({
      method: "POST",
      path: `/orders/v0/orders/${encodeURIComponent(input.amazonOrderId)}/shipmentConfirmation`,
      body: {
        marketplaceId,
        packageDetail: {
          packageReferenceId: "1",
          carrierCode: carrier.carrierCode,
          carrierName: carrier.carrierName,
          trackingNumber: input.trackingNumber,
          shipDate: new Date().toISOString(),
          orderItems,
        },
      },
    });
  } catch (error) {
    if (
      error instanceof AmazonApiError &&
      /already|shipped/i.test(error.body)
    ) {
      return "already";
    }
    throw error;
  }
  return "shipped";
}
