"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { OrderMapMarker } from "@/lib/orders/map-markers";

const OrdersMap = dynamic(
  () =>
    import("@/components/map/orders-map").then((mod) => mod.OrdersMap),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="min-h-[420px] w-full rounded-xl border border-border/60" />
    ),
  },
);

type OrdersMapPanelProps = {
  markers: OrderMapMarker[];
  rangeQuery?: string;
};

export function OrdersMapPanel({ markers, rangeQuery }: OrdersMapPanelProps) {
  return <OrdersMap markers={markers} rangeQuery={rangeQuery} />;
}
