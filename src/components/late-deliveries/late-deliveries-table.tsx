import Link from "next/link";

import { OrderTracking } from "@/components/orders/order-tracking";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDeliveryDate, formatOrderDate } from "@/lib/format";
import { resolveEbayUsername } from "@/lib/orders/ebay-buyer";
import { EBAY_ON_TIME_DELIVERY_DAYS, type LateEbayOrder } from "@/lib/orders/ebay-delivery-timing";

type LateDeliveriesTableProps = {
  lateOrders: LateEbayOrder[];
};

export function LateDeliveriesTable({ lateOrders }: LateDeliveriesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-6">Order</TableHead>
          <TableHead>Buyer</TableHead>
          <TableHead>Ordered</TableHead>
          <TableHead>Delivered</TableHead>
          <TableHead className="text-right">Days</TableHead>
          <TableHead className="text-right">Over target</TableHead>
          <TableHead>Tracking</TableHead>
          <TableHead className="pr-6 text-right">Target</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lateOrders.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={8}
              className="h-24 text-center text-muted-foreground"
            >
              No late eBay deliveries in this period.
            </TableCell>
          </TableRow>
        ) : (
          lateOrders.map(({ order, timing, daysOver }, index) => {
            const ebayUsername = resolveEbayUsername(order);

            return (
              <TableRow
                key={order.shopifyId}
                className={
                  index % 2 === 0 ? "border-border/40 bg-muted/15" : undefined
                }
              >
                <TableCell className="pl-6">
                  <Link
                    href={`/orders/${order.shopifyId}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{order.buyerName ?? "—"}</p>
                  {ebayUsername ? (
                    <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                      {ebayUsername}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatOrderDate(order.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {timing.deliveredAt
                    ? formatDeliveryDate(timing.deliveredAt)
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {timing.daysToDeliver != null ? `${timing.daysToDeliver}d` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className="border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300"
                  >
                    +{daysOver}d
                  </Badge>
                </TableCell>
                <TableCell>
                  <OrderTracking
                    numbers={order.trackingNumbers ?? []}
                    url={order.trackingUrl}
                    shipmentStatus={order.shipmentStatus}
                  />
                </TableCell>
                <TableCell className="pr-6 text-right text-sm text-muted-foreground">
                  {timing.usesDeliverByDate && timing.deliverByAt
                    ? formatDeliveryDate(timing.deliverByAt)
                    : `≤${EBAY_ON_TIME_DELIVERY_DAYS}d`}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
