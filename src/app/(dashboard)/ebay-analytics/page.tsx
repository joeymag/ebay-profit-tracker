import { Suspense } from "react";

import { EbayAnalyticsPanel } from "@/components/ebay-analytics/ebay-analytics-panel";
import { DateRangeFilterBar } from "@/components/filters/date-range-filter-bar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function EbayAnalyticsPage() {
  return (
    <>
      <DashboardHeader
        title="eBay analytics"
        description="Listing impressions, views, and conversion from the eBay Analytics API"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <DateRangeFilterBar />
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          }
        >
          <EbayAnalyticsPanel />
        </Suspense>
      </div>
    </>
  );
}
