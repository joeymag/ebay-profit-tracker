import { DailyChannelChart } from "@/components/dashboard/daily-channel-chart";
import { DateRangeFilterBar } from "@/components/filters/date-range-filter-bar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { aggregateDailyChannelPerformance } from "@/lib/orders/daily-channel-stats";
import { getStoredOrdersForRange } from "@/lib/orders/filtered-orders";

type DailySalesPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function DailySalesPage({
  searchParams,
}: DailySalesPageProps) {
  const params = await searchParams;
  const { orders, range, rangeLabel, totalOrders } =
    await getStoredOrdersForRange(params);
  const currency = orders[0]?.currency ?? "GBP";
  const summary = aggregateDailyChannelPerformance(orders, range);

  return (
    <>
      <DashboardHeader
        title="Daily sales"
        description={`eBay & Amazon takings and profit by day · ${rangeLabel}${totalOrders !== orders.length ? ` (${orders.length} of ${totalOrders} orders)` : ""}`}
      />
      <div className="flex flex-1 flex-col gap-8 p-5 md:p-10">
        <DateRangeFilterBar />
        <DailyChannelChart
          summary={summary}
          currency={currency}
          rangeLabel={rangeLabel}
        />
      </div>
    </>
  );
}
