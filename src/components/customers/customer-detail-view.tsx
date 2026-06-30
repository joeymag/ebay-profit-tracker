import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { MoneyCell } from "@/components/orders/money-cell";
import { OrderTags } from "@/components/orders/order-tags";
import { SalesChannelBadge } from "@/components/orders/sales-channel-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import type { CustomerDetail } from "@/lib/orders/customers";
import { phoneTelHref } from "@/lib/orders/shipping-address";
import type { DateRangeKey } from "@/lib/date-range";
import { cn } from "@/lib/utils";

type CustomerDetailViewProps = {
  customer: CustomerDetail;
  range?: DateRangeKey;
  searchQuery?: string;
};

function customersListHref(range?: DateRangeKey, searchQuery?: string): string {
  const params = new URLSearchParams();
  if (range && range !== "30days") {
    params.set("range", range);
  }
  if (searchQuery?.trim()) {
    params.set("q", searchQuery.trim());
  }
  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

export function CustomerDetailView({
  customer,
  range,
  searchQuery,
}: CustomerDetailViewProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
      <Link
        href={customersListHref(range, searchQuery)}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit gap-2")}
      >
        <ArrowLeft className="size-4" />
        Back to customers
      </Link>

      <Card className="surface-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{customer.displayName}</CardTitle>
              <CardDescription className="mt-2 space-y-1">
                {customer.ebayUsername ? (
                  <span className="block font-mono">
                    eBay username: {customer.ebayUsername}
                  </span>
                ) : null}
                {customer.phone ? (
                  <span className="block">
                    Phone:{" "}
                    <a
                      href={phoneTelHref(customer.phone)}
                      className="font-medium text-primary hover:underline"
                    >
                      {customer.phone}
                    </a>
                  </span>
                ) : null}
                <span className="flex items-center gap-2">
                  Primary channel:{" "}
                  <SalesChannelBadge
                    tags={customer.primaryChannel}
                    channel={customer.primaryChannel}
                  />
                </span>
              </CardDescription>
            </div>
            {customer.isRepeatCustomer ? (
              <Badge>Repeat customer · {customer.orderCount} orders</Badge>
            ) : (
              <Badge variant="secondary">First order</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">Total orders</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {customer.orderCount}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">Total spend</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMoney(customer.totalSpend, customer.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">Total profit</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                <MoneyCell
                  amount={customer.totalProfit}
                  currency={customer.currency}
                  emphasize
                />
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="surface-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle>Orders</CardTitle>
          <CardDescription>
            All orders from this customer, newest first
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="pr-6 text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.orders.map((order, index) => (
                  <TableRow
                    key={order.shopifyId}
                    className={
                      index % 2 === 0
                        ? "border-border/40 bg-muted/15"
                        : undefined
                    }
                  >
                    <TableCell className="pl-6">
                      <Link
                        href={`/orders/${order.shopifyId}`}
                        className="font-semibold hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatOrderDate(order.createdAt)}
                    </TableCell>
                    <TableCell>
                      {order.tags ? (
                        <OrderTags tags={order.tags} />
                      ) : (
                        <SalesChannelBadge
                          tags={order.channel}
                          channel={order.channel}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {order.itemCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(order.revenue, order.currency)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <MoneyCell
                        amount={order.profit}
                        currency={order.currency}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
