import { Suspense } from "react";

import { DateRangeFilterBar } from "@/components/filters/date-range-filter-bar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  MapAttributionNote,
  MapEmptyHint,
  MapStatsBar,
} from "@/components/map/map-page-chrome";
import { OrdersMapPanel } from "@/components/map/orders-map-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStoredOrdersForRange } from "@/lib/orders/filtered-orders";
import {
  countMissingGeocode,
  toOrderMapMarkers,
} from "@/lib/orders/map-markers";

type MapPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function MapPage({ searchParams }: MapPageProps) {
  const params = await searchParams;
  const { orders, rangeLabel, totalOrders } =
    await getStoredOrdersForRange(params);
  const markers = toOrderMapMarkers(orders);
  const missingGeocode = countMissingGeocode(orders);
  const rangeQuery = params.range;

  return (
    <>
      <DashboardHeader
        title="Order map"
        description={`OpenStreetMap view · ${rangeLabel}${totalOrders !== orders.length ? ` (${orders.length} of ${totalOrders})` : ""}`}
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <div className="surface-card p-5">
          <Suspense fallback={null}>
            <DateRangeFilterBar />
          </Suspense>
        </div>

        <MapStatsBar
          markerCount={markers.length}
          totalOrders={orders.length}
          missingGeocode={missingGeocode}
          rangeLabel={rangeLabel}
        />

        <MapEmptyHint markerCount={markers.length} />

        <Card className="surface-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle>
              {markers.length > 0
                ? `${markers.length} orders on the map`
                : "Order locations"}
            </CardTitle>
            <CardDescription>
              Each dot is a geocoded ship-to address. Clusters expand when you
              zoom in. Click a marker for order details.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-5">
            <div className="h-[min(70vh,720px)] min-h-[420px]">
              <OrdersMapPanel markers={markers} rangeQuery={rangeQuery} />
            </div>
          </CardContent>
        </Card>

        <MapAttributionNote />
      </div>
    </>
  );
}
