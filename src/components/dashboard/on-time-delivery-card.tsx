import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDeliveryDate } from "@/lib/format";
import { getSalesChannel } from "@/lib/orders/channel";
import {
  EBAY_ON_TIME_DELIVERY_DAYS,
  getEbayDeliveryTiming,
  type EbayOnTimeDeliveryStats,
} from "@/lib/orders/ebay-delivery-timing";
import type { DateRangeKey } from "@/lib/date-range";
import type { StoredOrder } from "@/lib/orders/types";

type OnTimeDeliveryCardProps = {
  stats: EbayOnTimeDeliveryStats;
  rangeLabel: string;
  orders: Pick<
    StoredOrder,
    | "shopifyId"
    | "orderNumber"
    | "tags"
    | "createdAt"
    | "shipmentStatus"
    | "deliveredAt"
    | "ebayDeliverByAt"
  >[];
  /** Hide pending bucket when filtering by delivery week/period. */
  showPending?: boolean;
  range?: DateRangeKey;
};

export function OnTimeDeliveryCard({
  stats,
  rangeLabel,
  orders,
  showPending = false,
  range,
}: OnTimeDeliveryCardProps) {
  const {
    ebayOrders,
    deliveredCount,
    onTimeCount,
    lateCount,
    pendingCount,
    missingDeliveryDateCount,
    onTimeRate,
  } = stats;

  const recentDelivered = orders
    .filter((order) => getSalesChannel(order.tags) === "eBay")
    .filter((order) => order.shipmentStatus === "delivered" && order.deliveredAt)
    .map((order) => ({
      order,
      timing: getEbayDeliveryTiming(order),
    }))
    .sort(
      (a, b) =>
        new Date(b.order.deliveredAt!).getTime() -
        new Date(a.order.deliveredAt!).getTime(),
    )
    .slice(0, 5);

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>On-time delivery</CardTitle>
        <CardDescription>
          eBay orders delivered on or before the promised deliver-by date (or
          within {EBAY_ON_TIME_DELIVERY_DAYS} days when no date is stored) ·{" "}
          {rangeLabel.toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deliveredCount === 0 ? (
          <div className="space-y-2">
            <p className="text-base text-muted-foreground">
              {missingDeliveryDateCount > 0
                ? `${missingDeliveryDateCount} eBay order${missingDeliveryDateCount === 1 ? "" : "s"} marked delivered in Shopify, but no delivery date is stored yet. Sync orders from Settings to pull delivery dates.`
                : "No eBay deliveries in this period yet."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                On-time rate
              </p>
              <p className="mt-2 text-5xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                {onTimeRate != null ? `${onTimeRate.toFixed(0)}%` : "—"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {onTimeCount} of {deliveredCount} delivered eBay orders on time
              </p>
              {missingDeliveryDateCount > 0 ? (
                <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
                  {missingDeliveryDateCount} delivered without a stored date —
                  sync orders to fill in.
                </p>
              ) : null}
              {lateCount > 0 ? (
                <Link
                  href={
                    range && range !== "30days"
                      ? `/late-deliveries?range=${range}`
                      : "/late-deliveries"
                  }
                  className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  View {lateCount} late order{lateCount === 1 ? "" : "s"} →
                </Link>
              ) : null}
            </div>

            <div className={`grid gap-3 ${showPending ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-sm text-muted-foreground">On time</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                  {onTimeCount}
                </p>
              </div>
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-muted-foreground">Late</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-red-800 dark:text-red-300">
                  {lateCount}
                </p>
              </div>
              {showPending ? (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">
                    {pendingCount}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Not delivered yet
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {recentDelivered.length > 0 ? (
          <div className="mt-6 border-t border-border/60 pt-5">
            <p className="text-sm font-medium text-muted-foreground">
              Recent deliveries
            </p>
            <ul className="mt-3 space-y-2">
              {recentDelivered.map(({ order, timing }) => (
                <li
                  key={order.shopifyId}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <Link
                    href={`/orders/${order.shopifyId}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  <span className="text-muted-foreground">
                    Delivered {formatDeliveryDate(order.deliveredAt!)}
                    {timing.onTime != null
                      ? timing.usesDeliverByDate && timing.daysLate != null
                        ? ` · ${timing.onTime ? "On time" : `Late (${timing.daysLate}d)`}`
                        : timing.daysToDeliver != null
                          ? ` · ${timing.daysToDeliver}d · ${timing.onTime ? "On time" : "Late"}`
                          : ` · ${timing.onTime ? "On time" : "Late"}`
                      : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
