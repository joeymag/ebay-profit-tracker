import { AtRiskDeliveriesTable } from "@/components/late-deliveries/at-risk-deliveries-table";
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
  const { lateOrders, atRiskOrders, rangeLabel } =
    await getLateDeliveriesForRange(params);

  const overdueCount = atRiskOrders.filter((row) => row.status === "overdue").length;
  const dueSoonCount = atRiskOrders.filter((row) => row.status === "at_risk").length;

  return (
    <>
      <DashboardHeader
        title="Late deliveries"
        description={`${atRiskOrders.length} open at risk/overdue · ${lateOrders.length} delivered late · ${rangeLabel.toLowerCase()}`}
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <div className="surface-card flex flex-col gap-4 p-5">
          <p className="text-sm text-muted-foreground">
            Open orders use eBay&apos;s promised deliver-by date to flag{" "}
            <span className="font-medium text-foreground">overdue</span> and{" "}
            <span className="font-medium text-foreground">at risk</span> before
            delivery. The list below that shows orders already delivered late
            (eBay deliver-by when known, otherwise more than{" "}
            {EBAY_ON_TIME_DELIVERY_DAYS} calendar days), filtered by{" "}
            <span className="font-medium text-foreground">delivery date</span>.
          </p>
          <DateRangeFilterBar />
        </div>

        <Card className="surface-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle>
              {atRiskOrders.length > 0
                ? `${atRiskOrders.length} at risk / overdue`
                : "No at-risk or overdue orders"}
            </CardTitle>
            <CardDescription>
              Open eBay orders · {overdueCount} overdue · {dueSoonCount} due
              today or tomorrow · based on eBay latest delivery date
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-0">
            <div className="overflow-x-auto">
              <AtRiskDeliveriesTable atRiskOrders={atRiskOrders} />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle>
              {lateOrders.length > 0
                ? `${lateOrders.length} late deliveries`
                : "No late deliveries"}
            </CardTitle>
            <CardDescription>
              {rangeLabel} · already delivered after the promised date (or after{" "}
              {EBAY_ON_TIME_DELIVERY_DAYS} days when no deliver-by date)
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
