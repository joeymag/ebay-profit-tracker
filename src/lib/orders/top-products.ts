import {
  CHANNEL_ORDER,
  getSalesChannel,
  type SalesChannel,
} from "@/lib/orders/channel";
import { resolveLineItemSkuForDisplay } from "@/lib/orders/line-item-sku";
import type { StoredLineItem, StoredOrder } from "@/lib/orders/types";

export type ProductChannelStats = {
  productKey: string;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  unitsSold: number;
  orderCount: number;
  revenue: number;
  cost: number;
  profit: number;
  ordersWithProfit: number;
};

export type ChannelTopProducts = {
  channel: SalesChannel;
  products: ProductChannelStats[];
  totalRevenue: number;
  totalProfit: number;
  totalUnits: number;
  ordersWithProfit: number;
};

type MutableProductStats = Omit<
  ProductChannelStats,
  "orderCount" | "unitsSold"
> & {
  unitsSold: number;
  orderIds: Set<number>;
};

type MutableChannelMeta = {
  ordersWithProfit: Set<number>;
};

function lineItemRevenue(item: StoredLineItem): number {
  return item.price * item.quantity;
}

function productKeyForLineItem(item: StoredLineItem): string {
  const sku = resolveLineItemSkuForDisplay(item.sku, item.title);
  return sku?.trim() || item.title.trim() || "Unknown product";
}

function allocateOrderToLineItems(order: StoredOrder): {
  key: string;
  item: StoredLineItem;
  share: number;
}[] {
  const items = order.lineItems.length
    ? order.lineItems
    : [
        {
          id: 0,
          title: "Unknown product",
          quantity: order.itemCount || 1,
          sku: null,
          price: order.revenue / Math.max(order.itemCount || 1, 1),
          productId: null,
          variantId: null,
          imageUrl: null,
          unitCost: null,
        },
      ];

  const weights = items.map((item) => {
    const revenue = lineItemRevenue(item);
    return revenue > 0 ? revenue : item.quantity;
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  return items.map((item, index) => ({
    key: productKeyForLineItem(item),
    item,
    share:
      weightTotal > 0 ? weights[index] / weightTotal : 1 / items.length,
  }));
}

export function aggregateTopProductsByChannel(
  orders: StoredOrder[],
  limit = 25,
): ChannelTopProducts[] {
  const byChannel = new Map<SalesChannel, Map<string, MutableProductStats>>();
  const channelMeta = new Map<SalesChannel, MutableChannelMeta>();

  for (const channel of CHANNEL_ORDER) {
    byChannel.set(channel, new Map());
    channelMeta.set(channel, { ordersWithProfit: new Set() });
  }

  for (const order of orders) {
    const channel = getSalesChannel(order.tags);
    const channelProducts = byChannel.get(channel)!;
    const meta = channelMeta.get(channel)!;
    const allocations = allocateOrderToLineItems(order);
    const hasProfit = order.profit != null;

    if (hasProfit) {
      meta.ordersWithProfit.add(order.shopifyId);
    }

    for (const { key, item, share } of allocations) {
      let stats = channelProducts.get(key);
      if (!stats) {
        stats = {
          productKey: key,
          sku: resolveLineItemSkuForDisplay(item.sku, item.title),
          title: item.title,
          imageUrl: item.imageUrl,
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          ordersWithProfit: 0,
          orderIds: new Set(),
        };
        channelProducts.set(key, stats);
      }

      if (!stats.imageUrl && item.imageUrl) {
        stats.imageUrl = item.imageUrl;
      }

      stats.unitsSold += item.quantity;
      stats.revenue += order.revenue * share;
      stats.cost += (order.cost ?? 0) * share;
      if (hasProfit) {
        stats.profit += order.profit! * share;
        if (!stats.orderIds.has(order.shopifyId)) {
          stats.ordersWithProfit += 1;
        }
      }
      stats.orderIds.add(order.shopifyId);
    }
  }

  return CHANNEL_ORDER.map((channel) => {
    const allProducts = [...(byChannel.get(channel)?.values() ?? [])].map(
      ({
        orderIds,
        ordersWithProfit,
        ...product
      }): ProductChannelStats => ({
        ...product,
        orderCount: orderIds.size,
        ordersWithProfit,
      }),
    );

    const totalRevenue = allProducts.reduce((sum, p) => sum + p.revenue, 0);
    const totalProfit = allProducts.reduce((sum, p) => sum + p.profit, 0);
    const totalUnits = allProducts.reduce((sum, p) => sum + p.unitsSold, 0);
    const ordersWithProfit =
      channelMeta.get(channel)?.ordersWithProfit.size ?? 0;

    const products = allProducts
      .sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold)
      .slice(0, limit);

    return {
      channel,
      products,
      totalRevenue,
      totalProfit,
      totalUnits,
      ordersWithProfit,
    };
  }).filter((section) => section.products.length > 0);
}
