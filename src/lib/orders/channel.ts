import type { StoredOrder } from "@/lib/orders/types";
import { effectiveProductCost } from "@/lib/orders/product-cost-vat";

export type SalesChannel = "Amazon" | "eBay" | "Temu" | "Other";

export type ChannelStats = {
  channel: SalesChannel;
  orders: number;
  revenue: number;
  productCost: number;
  postageCost: number;
  platformFee: number;
  totalCost: number;
  profit: number;
  ordersWithProfit: number;
  ordersWithProductCost: number;
  ordersWithPostage: number;
};

export const CHANNEL_ORDER: SalesChannel[] = ["Amazon", "eBay", "Temu", "Other"];

export type SalesChannelFilter = SalesChannel | "all";

export const CHANNEL_FILTER_OPTIONS: {
  key: SalesChannelFilter;
  param: string | null;
  label: string;
}[] = [
  { key: "all", param: null, label: "All channels" },
  { key: "Amazon", param: "amazon", label: "Amazon" },
  { key: "eBay", param: "ebay", label: "eBay" },
  { key: "Temu", param: "temu", label: "Temu" },
  { key: "Other", param: "other", label: "Other" },
];

export function parseSalesChannelFilter(
  value: string | null | undefined,
): SalesChannelFilter {
  if (!value?.trim()) {
    return "all";
  }

  const normalized = value.trim().toLowerCase();
  const match = CHANNEL_FILTER_OPTIONS.find(
    (option) => option.param === normalized,
  );
  return match?.key ?? "all";
}

export function getSalesChannelFilterLabel(channel: SalesChannelFilter): string {
  return (
    CHANNEL_FILTER_OPTIONS.find((option) => option.key === channel)?.label ??
    "All channels"
  );
}

export function filterOrdersByChannel(
  orders: StoredOrder[],
  channel: SalesChannelFilter,
): StoredOrder[] {
  if (channel === "all") {
    return orders;
  }

  return orders.filter((order) => getSalesChannel(order.tags) === channel);
}

export function getSalesChannel(tags: string | null | undefined): SalesChannel {
  const normalized = tags?.toLowerCase() ?? "";
  if (normalized.includes("temu")) {
    return "Temu";
  }
  if (normalized.includes("amazon")) {
    return "Amazon";
  }
  if (normalized.includes("ebay")) {
    return "eBay";
  }
  return "Other";
}

export function aggregateChannelStats(orders: StoredOrder[]): ChannelStats[] {
  const byChannel = new Map<SalesChannel, ChannelStats>();

  for (const channel of CHANNEL_ORDER) {
    byChannel.set(channel, {
      channel,
      orders: 0,
      revenue: 0,
      productCost: 0,
      postageCost: 0,
      platformFee: 0,
      totalCost: 0,
      profit: 0,
      ordersWithProfit: 0,
      ordersWithProductCost: 0,
      ordersWithPostage: 0,
    });
  }

  for (const order of orders) {
    const channel = getSalesChannel(order.tags);
    const stats = byChannel.get(channel)!;
    stats.orders += 1;
    stats.revenue += order.revenue;
    stats.productCost += effectiveProductCost(order.productCost, order.tags) ?? 0;
    stats.postageCost += order.shippingLabelCost ?? 0;
    stats.platformFee += order.platformFee ?? 0;
    if (order.profit != null && order.cost != null) {
      stats.totalCost += order.cost;
      stats.profit += order.profit;
      stats.ordersWithProfit += 1;
    }
    if (order.productCost != null && order.productCost > 0) {
      stats.ordersWithProductCost += 1;
    }
    if (order.shippingLabelCost != null && order.shippingLabelCost > 0) {
      stats.ordersWithPostage += 1;
    }
  }

  return CHANNEL_ORDER.map((channel) => byChannel.get(channel)!);
}

export const channelStyles: Record<
  SalesChannel,
  { badge: string; bar: string; label: string }
> = {
  Amazon: {
    label: "Amazon",
    badge:
      "border-amber-500/30 bg-amber-500/10 font-semibold text-amber-800 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  eBay: {
    label: "eBay",
    badge:
      "border-sky-500/30 bg-sky-500/10 font-semibold text-sky-800 dark:text-sky-300",
    bar: "bg-sky-500",
  },
  Temu: {
    label: "Temu",
    badge:
      "border-orange-500/30 bg-orange-500/10 font-semibold text-orange-800 dark:text-orange-300",
    bar: "bg-orange-500",
  },
  Other: {
    label: "Other",
    badge: "border-border bg-muted font-medium text-muted-foreground",
    bar: "bg-muted-foreground",
  },
};

/** Hex colors for map markers (match channel badge hues). */
export const channelMapColors: Record<SalesChannel, string> = {
  Amazon: "#f59e0b",
  eBay: "#0ea5e9",
  Temu: "#f97316",
  Other: "#64748b",
};
