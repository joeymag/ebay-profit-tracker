import { DateRangeFilterBar } from "@/components/filters/date-range-filter-bar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { TopProductsByChannel } from "@/components/top-products/top-products-by-channel";
import { getStoredOrdersForRange } from "@/lib/orders/filtered-orders";
import { aggregateTopProductsByChannel } from "@/lib/orders/top-products";

type TopProductsPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function TopProductsPage({
  searchParams,
}: TopProductsPageProps) {
  const params = await searchParams;
  const { orders, rangeLabel, totalOrders } = await getStoredOrdersForRange(
    params,
  );
  const currency = orders[0]?.currency ?? "GBP";
  const sections = aggregateTopProductsByChannel(orders);

  return (
    <>
      <DashboardHeader
        title="Top products"
        description={`Best sellers by sales channel · ${rangeLabel}${totalOrders !== orders.length ? ` (${orders.length} of ${totalOrders} orders)` : ""}`}
      />
      <div className="flex flex-1 flex-col gap-8 p-5 md:p-10">
        <DateRangeFilterBar />
        <TopProductsByChannel
          sections={sections}
          currency={currency}
          rangeLabel={rangeLabel}
        />
      </div>
    </>
  );
}
