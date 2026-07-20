import type { StoredOrder } from "@/lib/orders/types";
import {
  amazonSubscriptionForRange,
  amazonSubscriptionHint,
} from "@/lib/orders/amazon-subscription";
import {
  filterOrdersByChannel,
  getSalesChannel,
  getSalesChannelFilterLabel,
  parseSalesChannelFilter,
  type SalesChannelFilter,
} from "@/lib/orders/channel";
import {
  filterOrdersByDateRange,
  filterOrdersByDeliveryDateRange,
  getDateRangeLabel,
  getDeliveryDateRangeLabel,
  parseDateRange,
  type DateRangeKey,
} from "@/lib/date-range";
import { aggregateEbayOnTimeDelivery, listLateEbayOrders } from "@/lib/orders/ebay-delivery-timing";
import { aggregateEbayDashboardFees } from "@/lib/orders/platform-fees";
import { effectiveProductCost } from "@/lib/orders/product-cost-vat";
import { getRepeatEbayCustomerUsernames } from "@/lib/orders/customer-history";
import {
  filterOrdersByProductTitle,
  formatProductFilterLabel,
  parseProductFilter,
} from "@/lib/orders/product-filter";
import { getStoredOrders } from "@/lib/orders/store";

export async function getStoredOrdersForRange(searchParams?: {
  range?: string;
  channel?: string;
  product?: string;
}) {
  const range = parseDateRange(searchParams?.range);
  const channel = parseSalesChannelFilter(searchParams?.channel);
  const product = parseProductFilter(searchParams?.product);
  const database = await getStoredOrders();
  const ordersInRange = filterOrdersByDateRange(database.orders, range);
  const ordersByChannel = filterOrdersByChannel(ordersInRange, channel);
  const orders = filterOrdersByProductTitle(ordersByChannel, product);

  return {
    ...database,
    orders,
    allOrders: database.orders,
    range,
    channel,
    product,
    rangeLabel: getDateRangeLabel(range),
    channelLabel: getSalesChannelFilterLabel(channel),
    productLabel: product ? formatProductFilterLabel(product) : null,
    totalOrders: database.orders.length,
    ordersInRange: ordersInRange.length,
    ordersBeforeProductFilter: ordersByChannel.length,
    repeatEbayUsernames: getRepeatEbayCustomerUsernames(database.orders),
  };
}

export type OrdersForRange = Awaited<ReturnType<typeof getStoredOrdersForRange>>;

export function getFilteredProfitLabel(
  range: DateRangeKey,
  channel: SalesChannelFilter,
  product: string | null,
): string {
  if (product) {
    return `Profit · ${product.length > 28 ? `${product.slice(0, 28)}…` : product}`;
  }

  if (channel !== "all") {
    return `${getSalesChannelFilterLabel(channel)} profit`;
  }

  switch (range) {
    case "today":
      return "Last 24 hours profit";
    case "week":
      return "This week's profit";
    case "last-week":
      return "Last week's profit";
    case "last-month":
      return "Last month's profit";
    case "30days":
      return "Last 30 days profit";
    case "all":
      return "All-time profit";
    default:
      return "Profit";
  }
}

export function summarizeOrders(
  orders: StoredOrder[],
  currency: string,
  range: DateRangeKey,
  allOrders: StoredOrder[] = orders,
  channel: SalesChannelFilter = "all",
) {
  const revenue = orders.reduce((sum, o) => sum + o.revenue, 0);
  const productCost = orders.reduce(
    (sum, o) => sum + (effectiveProductCost(o.productCost, o.tags) ?? 0),
    0,
  );
  const postageCost = orders.reduce(
    (sum, o) => sum + (o.shippingLabelCost ?? 0),
    0,
  );
  const platformFee = orders.reduce(
    (sum, o) => sum + (o.platformFee ?? 0),
    0,
  );
  const amazonPlatformFee = orders.reduce(
    (sum, o) =>
      getSalesChannel(o.tags) === "Amazon" ? sum + (o.platformFee ?? 0) : sum,
    0,
  );
  const ebayFees = aggregateEbayDashboardFees(orders);
  const ordersWithPlatformFee = orders.filter(
    (o) => o.platformFee != null && o.platformFee > 0,
  ).length;
  const ordersWithAmazonPlatformFee = orders.filter(
    (o) =>
      getSalesChannel(o.tags) === "Amazon" &&
      o.platformFee != null &&
      o.platformFee > 0,
  ).length;
  const orderCosts = orders.reduce(
    (sum, o) => sum + (o.cost ?? 0),
    0,
  );
  const amazonSubscription =
    channel === "all" || channel === "Amazon"
      ? amazonSubscriptionForRange(range, allOrders)
      : 0;
  const totalCost = orderCosts + amazonSubscription;
  const profit =
    orders.reduce((sum, o) => sum + (o.profit ?? 0), 0) - amazonSubscription;
  const ordersWithPostage = orders.filter(
    (o) => o.shippingLabelCost != null && o.shippingLabelCost > 0,
  ).length;
  const ordersWithProductCost = orders.filter(
    (o) => o.productCost != null && o.productCost > 0,
  ).length;
  const ordersWithProfit = orders.filter((o) => o.profit != null).length;
  const ordersMissingProductCost = orders.length - ordersWithProductCost;
  const ordersMissingPostage = orders.filter(
    (o) => o.shippingLabelCost == null || o.shippingLabelCost === 0,
  ).length;
  const marginPercent =
    revenue > 0 && ordersWithProfit > 0
      ? (profit / revenue) * 100
      : null;

  return {
    currency,
    revenue,
    productCost,
    postageCost,
    platformFee,
    amazonPlatformFee,
    ebaySellingFees: ebayFees.ebaySellingFees,
    ebayAdsFees: ebayFees.ebayAdsFees,
    ebayOrders: ebayFees.ebayOrders,
    ebayOrdersWithSellingFee: ebayFees.ebayOrdersWithSellingFee,
    ebayOrdersWithAdsFee: ebayFees.ebayOrdersWithAdsFee,
    ebayOrdersWithActualFees: ebayFees.ebayOrdersWithActualFees,
    amazonSubscription,
    amazonSubscriptionHint: amazonSubscriptionHint(range, amazonSubscription),
    orderCosts,
    totalCost,
    profit,
    marginPercent,
    range,
    ordersWithPostage,
    ordersWithProductCost,
    ordersWithPlatformFee,
    ordersWithAmazonPlatformFee,
    ordersWithProfit,
    ordersMissingProductCost,
    ordersMissingPostage,
  };
}

export function summarizeOnTimeDelivery(
  allOrders: StoredOrder[],
  range: DateRangeKey,
  channel: SalesChannelFilter,
) {
  const deliveryOrders = filterOrdersByDeliveryDateRange(
    filterOrdersByChannel(allOrders, channel),
    range,
  );

  return {
    stats: aggregateEbayOnTimeDelivery(deliveryOrders),
    deliveryOrders,
    deliveryRangeLabel: getDeliveryDateRangeLabel(range),
  };
}

export async function getLateDeliveriesForRange(searchParams?: {
  range?: string;
}) {
  const range = parseDateRange(searchParams?.range);
  const database = await getStoredOrders();
  const deliveryOrders = filterOrdersByDeliveryDateRange(database.orders, range);
  const lateOrders = listLateEbayOrders(deliveryOrders);

  return {
    lateOrders,
    range,
    rangeLabel: getDeliveryDateRangeLabel(range),
  };
}
