import { notFound } from "next/navigation";

import { CustomerHistoryCard } from "@/components/orders/customer-history-card";
import { OrderDetailView } from "@/components/orders/order-detail-view";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getSalesChannel } from "@/lib/orders/channel";
import { getEbayCustomerHistory } from "@/lib/orders/customer-history";
import { extractEbayDisplayName, resolveEbayUsername } from "@/lib/orders/ebay-buyer";
import { getStoredOrderByShopifyId } from "@/lib/orders/store";

type OrderDetailPageProps = {
  params: Promise<{ shopifyId: string }>;
  searchParams: Promise<{ range?: string; channel?: string }>;
};

function buildOrdersListHref(query: {
  range?: string;
  channel?: string;
}): string {
  const params = new URLSearchParams();
  if (query.range) {
    params.set("range", query.range);
  }
  if (query.channel) {
    params.set("channel", query.channel);
  }
  const qs = params.toString();
  return qs ? `/orders?${qs}` : "/orders";
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: OrderDetailPageProps) {
  const { shopifyId } = await params;
  const query = await searchParams;
  const id = Number(shopifyId);

  if (!Number.isFinite(id)) {
    notFound();
  }

  const order = await getStoredOrderByShopifyId(id);

  if (!order) {
    notFound();
  }

  const customerHistory = await getEbayCustomerHistory(order);
  const backHref = buildOrdersListHref(query);
  const detailQuery = new URLSearchParams();
  if (query.range) {
    detailQuery.set("range", query.range);
  }
  if (query.channel) {
    detailQuery.set("channel", query.channel);
  }
  const detailQueryString = detailQuery.toString();

  const ebayUsername = resolveEbayUsername(order);
  const displayName = extractEbayDisplayName(order.buyerName);
  const isAmazon = getSalesChannel(order.tags) === "Amazon";
  const isEbay = getSalesChannel(order.tags) === "eBay";
  const descriptionParts = [
    displayName ?? order.buyerName,
    ebayUsername ? `@${ebayUsername}` : null,
    isEbay && order.ebayOrderId ? order.ebayOrderId : null,
    isAmazon && order.amazonOrderId ? order.amazonOrderId : null,
    `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return (
    <>
      <DashboardHeader
        title={order.orderNumber}
        description={descriptionParts.join(" · ")}
      />
      <OrderDetailView
        order={order}
        backHref={backHref}
        customerHistory={customerHistory}
        detailQuery={detailQueryString || undefined}
      />
    </>
  );
}
