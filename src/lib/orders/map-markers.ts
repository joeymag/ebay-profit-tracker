import { getSalesChannel, type SalesChannel } from "@/lib/orders/channel";
import { formatMoney } from "@/lib/format";
import type { StoredOrder } from "@/lib/orders/types";

export type OrderMapMarker = {
  shopifyId: number;
  orderNumber: string;
  buyerName: string | null;
  latitude: number;
  longitude: number;
  revenueLabel: string;
  channel: SalesChannel;
  region: string | null;
  city: string | null;
};

export function isGeocodedOrder(
  order: StoredOrder,
): order is StoredOrder & { latitude: number; longitude: number } {
  return order.latitude != null && order.longitude != null;
}

export function toOrderMapMarkers(orders: StoredOrder[]): OrderMapMarker[] {
  return orders.filter(isGeocodedOrder).map((order) => ({
    shopifyId: order.shopifyId,
    orderNumber: order.orderNumber,
    buyerName: order.buyerName,
    latitude: order.latitude,
    longitude: order.longitude,
    revenueLabel: formatMoney(order.revenue, order.currency),
    channel: getSalesChannel(order.tags),
    region: order.geocodeRegion,
    city: order.shippingAddress?.city ?? null,
  }));
}

export function countMissingGeocode(orders: StoredOrder[]): number {
  return orders.filter(
    (order) =>
      !isGeocodedOrder(order) &&
      [
        order.shippingAddress?.address1,
        order.shippingAddress?.city,
        order.shippingAddress?.zip,
      ].some(Boolean),
  ).length;
}
