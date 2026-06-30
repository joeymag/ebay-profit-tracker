import { getSalesChannel } from "@/lib/orders/channel";
import { getDeliverByTiming, type DeliverByTiming } from "@/lib/orders/deliver-by-timing";
import type { StoredOrder } from "@/lib/orders/types";

export type AmazonDeliveryTiming = DeliverByTiming;

export function getAmazonDeliveryTiming(
  order: Pick<
    StoredOrder,
    "tags" | "shipmentStatus" | "deliveredAt" | "amazonDeliverByAt"
  >,
): AmazonDeliveryTiming {
  if (getSalesChannel(order.tags) !== "Amazon") {
    return {
      deliverByAt: null,
      deliveredAt: null,
      onTime: null,
      daysLate: null,
      overdue: false,
    };
  }

  return getDeliverByTiming({
    deliverByAt: order.amazonDeliverByAt,
    deliveredAt: order.deliveredAt,
    shipmentStatus: order.shipmentStatus,
  });
}
