import { getOrderLocationLabel } from "@/lib/orders/shipping-address";
import type { StoredOrder } from "@/lib/orders/types";

export type LocationStat = {
  label: string;
  orders: number;
  revenue: number;
  sharePercent: number;
};

export function aggregateOrderLocations(orders: StoredOrder[]): LocationStat[] {
  const byLocation = new Map<string, { orders: number; revenue: number }>();

  for (const order of orders) {
    const label = getOrderLocationLabel(order);
    const entry = byLocation.get(label) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += order.revenue;
    byLocation.set(label, entry);
  }

  const total = orders.length;

  return [...byLocation.entries()]
    .map(([label, stats]) => ({
      label,
      orders: stats.orders,
      revenue: stats.revenue,
      sharePercent: total > 0 ? (stats.orders / total) * 100 : 0,
    }))
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);
}

export function countOrdersWithAddress(orders: StoredOrder[]): number {
  return orders.filter((order) =>
    [
      order.shippingAddress?.address1,
      order.shippingAddress?.city,
      order.shippingAddress?.zip,
    ].some(Boolean),
  ).length;
}

export function countGeocodedOrders(orders: StoredOrder[]): number {
  return orders.filter(
    (order) => order.latitude != null && order.longitude != null,
  ).length;
}
