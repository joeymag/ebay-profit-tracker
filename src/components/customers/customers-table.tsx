import Link from "next/link";

import { MoneyCell } from "@/components/orders/money-cell";
import { SalesChannelBadge } from "@/components/orders/sales-channel-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DateRangeKey } from "@/lib/date-range";
import { formatMoney, formatOrderDate } from "@/lib/format";
import type { CustomerSummary } from "@/lib/orders/customers";
import { customerHref } from "@/lib/orders/customers";
import { phoneTelHref } from "@/lib/orders/shipping-address";

type CustomersTableProps = {
  customers: CustomerSummary[];
  range?: DateRangeKey;
  searchQuery?: string;
};

function customerDetailHref(
  customerId: string,
  range?: DateRangeKey,
  searchQuery?: string,
): string {
  const params = new URLSearchParams();
  if (range && range !== "30days") {
    params.set("range", range);
  }
  if (searchQuery?.trim()) {
    params.set("q", searchQuery.trim());
  }
  const query = params.toString();
  const base = customerHref(customerId);
  return query ? `${base}?${query}` : base;
}

export function CustomersTable({
  customers,
  range,
  searchQuery,
}: CustomersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-6">Customer</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Channel</TableHead>
          <TableHead className="text-right">Orders</TableHead>
          <TableHead className="text-right">Total spend</TableHead>
          <TableHead className="text-right">Total profit</TableHead>
          <TableHead className="pr-6 text-right">Last order</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={7}
              className="h-24 text-center text-muted-foreground"
            >
              No customers found{searchQuery ? " matching your search" : ""}.
            </TableCell>
          </TableRow>
        ) : (
          customers.map((customer, index) => (
            <TableRow
              key={customer.id}
              className={
                index % 2 === 0 ? "border-border/40 bg-muted/15" : undefined
              }
            >
              <TableCell className="pl-6">
                <Link
                  href={customerDetailHref(customer.id, range, searchQuery)}
                  className="block font-semibold hover:underline"
                >
                  {customer.displayName}
                </Link>
                {customer.ebayUsername ? (
                  <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                    eBay: {customer.ebayUsername}
                  </p>
                ) : null}
                {customer.isRepeatCustomer ? (
                  <Badge variant="secondary" className="mt-2 text-xs">
                    Repeat customer
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>
                {customer.phone ? (
                  <a
                    href={phoneTelHref(customer.phone)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {customer.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <SalesChannelBadge
                  tags={customer.primaryChannel}
                  channel={customer.primaryChannel}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {customer.orderCount}
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(customer.totalSpend, customer.currency)}
              </TableCell>
              <TableCell className="text-right">
                <MoneyCell
                  amount={customer.totalProfit}
                  currency={customer.currency}
                  emphasize
                />
              </TableCell>
              <TableCell className="pr-6 text-right text-muted-foreground">
                {formatOrderDate(customer.lastOrderAt)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
