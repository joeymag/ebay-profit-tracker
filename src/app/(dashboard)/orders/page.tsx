import { Suspense } from "react";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ChannelFilterBar } from "@/components/filters/channel-filter-bar";
import { DateRangeFilterBar } from "@/components/filters/date-range-filter-bar";
import { ProductFilterBar } from "@/components/filters/product-filter-bar";
import { OrdersPageClient } from "@/components/orders/orders-page-client";
import { AutoSyncStatusCard } from "@/components/orders/auto-sync-status-card";
import { ExportOrdersCsvButton } from "@/components/orders/export-orders-csv-button";
import { SyncOrdersButton } from "@/components/orders/sync-orders-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatOrderDate } from "@/lib/format";
import { isOrderCostsIncomplete } from "@/lib/orders/cost-completeness";
import {
  getFilteredProfitLabel,
  getStoredOrdersForRange,
  summarizeOrders,
} from "@/lib/orders/filtered-orders";
import { getAutoSyncStatus } from "@/lib/shopify/auto-sync-status";
import { OrdersFilterSummary } from "@/components/orders/orders-filter-summary";

type OrdersPageProps = {
  searchParams: Promise<{ range?: string; channel?: string; product?: string }>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const {
    orders,
    allOrders,
    syncedAt,
    range,
    channel,
    rangeLabel,
    channelLabel,
    productLabel,
    product,
    ordersInRange,
    ordersBeforeProductFilter,
    repeatEbayUsernames,
  } = await getStoredOrdersForRange(params);
  const autoSyncStatus = await getAutoSyncStatus();

  const currency = orders[0]?.currency ?? "GBP";
  const summary = summarizeOrders(orders, currency, range, allOrders);
  const profitLabel = getFilteredProfitLabel(range, channel, product);
  const ordersWithFullCosts = orders.filter(
    (o) => !isOrderCostsIncomplete(o),
  ).length;

  const filterParts = [rangeLabel];
  if (channelLabel !== "All channels") {
    filterParts.push(channelLabel);
  }
  if (productLabel) {
    filterParts.push(productLabel);
  }
  const filterSummary = filterParts.join(" · ");
  const countHint =
    product && orders.length !== ordersBeforeProductFilter
      ? `${orders.length} of ${ordersBeforeProductFilter} matching · ${filterSummary}`
      : orders.length !== ordersInRange
        ? `${orders.length} of ${ordersInRange} in ${filterSummary}`
        : `${orders.length} orders · ${filterSummary}`;

  return (
    <>
      <DashboardHeader title="Orders" description={countHint} />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <AutoSyncStatusCard status={autoSyncStatus} />
        <div className="surface-card flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <SyncOrdersButton autoSyncStatus={autoSyncStatus} />
            {syncedAt ? (
              <p className="text-base text-muted-foreground">
                Last synced: {formatOrderDate(syncedAt)} ·{" "}
                <a
                  href="/orders/api-sample"
                  className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  View API sample
                </a>
              </p>
            ) : (
              <a
                href="/orders/api-sample"
                className="text-base font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                View API sample
              </a>
            )}
          </div>
          <DateRangeFilterBar />
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Sales channel
            </p>
            <ChannelFilterBar />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Product</p>
            <ProductFilterBar />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
            <p className="text-sm text-muted-foreground">
              Download orders with SKU and costs for the current filters (opens in
              Excel / Google Sheets).
            </p>
            <Suspense fallback={null}>
              <ExportOrdersCsvButton orderCount={orders.length} />
            </Suspense>
          </div>
        </div>

        <OrdersFilterSummary
          orderCount={orders.length}
          ordersWithFullCosts={ordersWithFullCosts}
          summary={summary}
          profitLabel={profitLabel}
          filterSummary={filterSummary}
        />

        <Card className="surface-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle>
              {orders.length > 0
                ? `${orders.length} orders`
                : "No matching orders"}
            </CardTitle>
            <CardDescription>
              Select orders with the checkboxes to bulk-edit product cost and
              postage. Red values are missing — product cost, postage, or eBay
              fees (sync from eBay in Settings). New eBay orders copy postage
              from your last order with the same SKU on sync; set unit cost once
              on Products. Click an order number for details.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-0 sm:px-0">
            <div className="overflow-x-auto">
              <Suspense fallback={null}>
                <OrdersPageClient
                  orders={orders}
                  repeatEbayUsernames={repeatEbayUsernames}
                  productFilter={product}
                />
              </Suspense>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
