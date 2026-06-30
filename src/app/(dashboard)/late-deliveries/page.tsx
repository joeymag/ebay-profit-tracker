import { LateDeliveriesTable } from "@/components/late-deliveries/late-deliveries-table";
import { DateRangeFilterBar } from "@/components/filters/date-range-filter-bar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EBAY_ON_TIME_DELIVERY_DAYS } from "@/lib/orders/ebay-delivery-timing";
import { getLateDeliveriesForRange } from "@/lib/orders/filtered-orders";

type LateDeliveriesPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function LateDeliveriesPage({
  searchParams,
}: LateDeliveriesPageProps) {
  const params = await searchParams;
  const { lateOrders, rangeLabel } = await getLateDeliveriesForRange(params);

  return (
    <>
      <DashboardHeader
        title="Late deliveries"
        description={`${lateOrders.length} late eBay order${lateOrders.length === 1 ? "" : "s"} · ${rangeLabel.toLowerCase()}`}
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <div className="surface-card flex flex-col gap-4 p-5">
          <p className="text-sm text-muted-foreground">
            eBay orders delivered more than {EBAY_ON_TIME_DELIVERY_DAYS} calendar
            days after the order date. Filtered by{" "}
            <span className="font-medium text-foreground">delivery date</span>,
            not order date.
          </p>
          <DateRangeFilterBar />
        </div>

        <Card className="surface-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle>
              {lateOrders.length > 0
                ? `${lateOrders.length} late deliveries`
                : "No late deliveries"}
            </CardTitle>
            <CardDescription>
              {rangeLabel} · target is {EBAY_ON_TIME_DELIVERY_DAYS} calendar days
              from order to delivery
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-0">
            <div className="overflow-x-auto">
              <LateDeliveriesTable lateOrders={lateOrders} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
