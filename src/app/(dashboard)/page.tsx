import {
  CircleDollarSign,
  Package,
  PiggyBank,
  Receipt,
} from "lucide-react";

import { ChannelProfitCard } from "@/components/dashboard/channel-profit-card";
import { DailyChannelChart } from "@/components/dashboard/daily-channel-chart";
import { CostBreakdownCard } from "@/components/dashboard/cost-breakdown-card";
import { OnTimeDeliveryCard } from "@/components/dashboard/on-time-delivery-card";
import { OrderLocationsCard } from "@/components/dashboard/order-locations-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilterBar } from "@/components/filters/date-range-filter-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { formatMoney } from "@/lib/format";
import { aggregateChannelStats } from "@/lib/orders/channel";
import { aggregateDailyChannelPerformance } from "@/lib/orders/daily-channel-stats";
import {
  aggregateOrderLocations,
  countGeocodedOrders,
  countOrdersWithAddress,
} from "@/lib/orders/locations";
import {
  getStoredOrdersForRange,
  summarizeOnTimeDelivery,
  summarizeOrders,
} from "@/lib/orders/filtered-orders";

type DashboardPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const { orders, allOrders, syncedAt, rangeLabel, totalOrders, range, channel } =
    await getStoredOrdersForRange(params);
  const currency = orders[0]?.currency ?? "GBP";
  const channelStats = aggregateChannelStats(orders);
  const dailySummary = aggregateDailyChannelPerformance(orders, range);
  const summary = summarizeOrders(orders, currency, range, allOrders);
  const onTimeDelivery = summarizeOnTimeDelivery(allOrders, range, channel);
  const locationStats = aggregateOrderLocations(orders);
  const ordersWithAddress = countOrdersWithAddress(orders);
  const geocodedOrders = countGeocodedOrders(orders);

  const stats = [
    {
      label: "Revenue",
      value: orders.length ? formatMoney(summary.revenue, currency) : "—",
      hint: `${rangeLabel} · synced orders`,
      icon: CircleDollarSign,
      accent: "revenue" as const,
    },
    {
      label: "Postage",
      value: summary.postageCost ? formatMoney(summary.postageCost, currency) : "—",
      hint: summary.ordersWithPostage
        ? `${summary.ordersWithPostage} Shopify labels`
        : "Sync to pull label costs",
      icon: Receipt,
      accent: "cost" as const,
    },
    {
      label: "Profit",
      value:
        orders.length && (summary.totalCost > 0 || summary.revenue > 0)
          ? formatMoney(summary.profit, currency)
          : "—",
      hint: summary.amazonSubscription
        ? "After product, postage, Amazon fees & subscription"
        : summary.ordersWithProductCost
          ? "Revenue minus postage and product cost"
          : "Add unit costs on the Products page",
      icon: PiggyBank,
      accent: "profit" as const,
    },
    {
      label: "Orders",
      value: String(orders.length),
      hint: `${channelStats.find((c) => c.channel === "Amazon")?.orders ?? 0} Amazon · ${channelStats.find((c) => c.channel === "eBay")?.orders ?? 0} eBay · ${channelStats.find((c) => c.channel === "Temu")?.orders ?? 0} Temu`,
      icon: Package,
      accent: "orders" as const,
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Dashboard"
        description={`Overview · ${rangeLabel}${totalOrders !== orders.length ? ` (${orders.length} of ${totalOrders} orders)` : ""}`}
      />
      <div className="flex flex-1 flex-col gap-8 p-5 md:p-10">
        <DateRangeFilterBar />

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        {orders.length > 0 ? (
          <>
            <DailyChannelChart
              summary={dailySummary}
              currency={currency}
              rangeLabel={rangeLabel}
            />
            <CostBreakdownCard
              summary={summary}
              rangeLabel={rangeLabel}
              orderCount={orders.length}
            />
            <ChannelProfitCard
              stats={channelStats}
              currency={currency}
              totalProfit={summary.profit}
            />
            <OrderLocationsCard
              locations={locationStats}
              currency={currency}
              ordersWithAddress={ordersWithAddress}
              geocodedOrders={geocodedOrders}
              totalOrders={orders.length}
              rangeLabel={rangeLabel}
            />
          </>
        ) : (
          <Card className="surface-card">
            <CardHeader>
              <CardTitle>No orders in this period</CardTitle>
              <CardDescription>
                Try a wider date range or sync new orders from Shopify.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <OnTimeDeliveryCard
          stats={onTimeDelivery.stats}
          rangeLabel={onTimeDelivery.deliveryRangeLabel}
          orders={onTimeDelivery.deliveryOrders}
          showPending={range === "all"}
          range={range}
        />

        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Quick start</CardTitle>
            <CardDescription>
              {syncedAt
                ? `${orders.length} orders in ${rangeLabel.toLowerCase()} · ${summary.ordersWithPostage} with Shopify postage`
                : "Connect Shopify and sync orders to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-base text-muted-foreground sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-5">
              <p className="text-lg font-semibold text-foreground">1. Connect</p>
              <p className="mt-2 leading-relaxed">Add Client ID + Secret in Settings</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-5">
              <p className="text-lg font-semibold text-foreground">2. Sync</p>
              <p className="mt-2 leading-relaxed">Import orders from Shopify</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-5">
              <p className="text-lg font-semibold text-foreground">3. Profit</p>
              <p className="mt-2 leading-relaxed">
                Set unit costs on Products — orders link by SKU
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
