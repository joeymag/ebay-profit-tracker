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
import type { AtRiskEbayOrder } from "@/lib/orders/ebay-delivery-timing";

type AtRiskDeliveriesTableProps = {
  atRiskOrders: AtRiskEbayOrder[];
};

export function AtRiskDeliveriesTable({
  atRiskOrders,
}: AtRiskDeliveriesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-6">Order</TableHead>
          <TableHead>Buyer</TableHead>
          <TableHead>Ordered</TableHead>
          <TableHead>eBay deliver by</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Timing</TableHead>
          <TableHead className="pr-6">Tracking</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {atRiskOrders.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={7}
              className="h-24 text-center text-muted-foreground"
            >
              No overdue or at-risk open eBay orders right now.
            </TableCell>
          </TableRow>
        ) : (
          atRiskOrders.map(({ order, timing, status, daysPastDue, daysUntilDue }, index) => {
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
                  {timing.deliverByAt
                    ? formatDeliveryDate(timing.deliverByAt)
                    : "—"}
                </TableCell>
                <TableCell>
                  {status === "overdue" ? (
                    <Badge
                      variant="outline"
                      className="border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300"
                    >
                      Overdue
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300"
                    >
                      At risk
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {status === "overdue"
                    ? `+${daysPastDue}d late`
                    : daysUntilDue === 0
                      ? "Due today"
                      : `Due in ${daysUntilDue}d`}
                </TableCell>
                <TableCell className="pr-6">
                  <OrderTracking
                    numbers={order.trackingNumbers ?? []}
                    url={order.trackingUrl}
                    shipmentStatus={order.shipmentStatus}
                  />
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
