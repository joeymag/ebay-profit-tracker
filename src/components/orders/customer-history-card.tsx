import Link from "next/link";

import { MoneyCell } from "@/components/orders/money-cell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatOrderDate } from "@/lib/format";
import type { CustomerHistory } from "@/lib/orders/customer-history";
import { cn } from "@/lib/utils";

type CustomerHistoryCardProps = {
  history: CustomerHistory;
  detailQuery?: string;
};

export function CustomerHistoryCard({
  history,
  detailQuery,
}: CustomerHistoryCardProps) {
  const orderHref = (shopifyId: number) =>
    detailQuery
      ? `/orders/${shopifyId}?${detailQuery}`
      : `/orders/${shopifyId}`;

  const otherOrders = history.orders.filter((item) => !item.isCurrent);

  return (
    <Card className="surface-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>eBay customer history</CardTitle>
            <CardDescription>
              Matched by eBay username{" "}
              <span className="font-mono font-medium text-foreground">
                {history.ebayUsername}
              </span>
            </CardDescription>
          </div>
          <Badge
            variant={history.isRepeatCustomer ? "default" : "secondary"}
            className="text-sm"
          >
            {history.isRepeatCustomer ? "Repeat customer" : "First order"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">Total orders</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {history.orderCount}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">Total spend</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatMoney(history.totalSpend, history.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">Total profit</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {history.totalProfit != null ? (
                <MoneyCell
                  amount={history.totalProfit}
                  currency={history.currency}
                  emphasize
                />
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>

        {history.isRepeatCustomer ? (
          <div>
            <p className="mb-3 text-base font-medium">
              {otherOrders.length} other order
              {otherOrders.length === 1 ? "" : "s"} from this buyer
            </p>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.orders.map((item) => (
                  <TableRow
                    key={item.shopifyId}
                    className={cn(item.isCurrent && "bg-primary/5")}
                  >
                    <TableCell>
                      <Link
                        href={orderHref(item.shopifyId)}
                        className={cn(
                          "font-semibold hover:underline",
                          item.isCurrent
                            ? "text-primary"
                            : "text-foreground",
                        )}
                      >
                        {item.orderNumber}
                        {item.isCurrent ? " (this order)" : ""}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatOrderDate(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.itemCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(item.revenue, item.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell
                        amount={item.profit}
                        currency={item.currency}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-base text-muted-foreground">
            This is the first order we have from{" "}
            <span className="font-medium text-foreground">
              {history.displayName ?? history.ebayUsername}
            </span>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
