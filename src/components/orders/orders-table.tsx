"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { MoneyCell } from "@/components/orders/money-cell";
import { OrderTags } from "@/components/orders/order-tags";
import { OnTimeDeliveryBadge } from "@/components/orders/on-time-delivery-badge";
import { OrderTracking } from "@/components/orders/order-tracking";
import { ShippingCarrier } from "@/components/orders/shipping-carrier";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatOrderDate } from "@/lib/format";
import {
  normalizeEbayUsername,
  resolveEbayUsername,
} from "@/lib/orders/ebay-buyer";
import { isOrderCostsIncomplete, getOrderCostFieldStatus } from "@/lib/orders/cost-completeness";
import {
  EbayFeeCell,
  ProductCostCell,
} from "@/components/orders/missing-value-cell";
import { getOrderProductDisplay } from "@/lib/orders/product-filter";
import {
  customerHref,
  encodeCustomerId,
  getCustomerKey,
} from "@/lib/orders/customers";
import type { StoredOrder } from "@/lib/orders/types";
import { cn } from "@/lib/utils";

type OrdersTableProps = {
  orders: StoredOrder[];
  repeatEbayUsernames?: string[];
  productFilter?: string | null;
  selectedIds?: Set<number>;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleOrder?: (shopifyId: number, checked: boolean) => void;
  onToggleAll?: (checked: boolean) => void;
};

export function OrdersTable({
  orders,
  repeatEbayUsernames = [],
  productFilter,
  selectedIds,
  allSelected = false,
  someSelected = false,
  onToggleOrder,
  onToggleAll,
}: OrdersTableProps) {
  const bulkMode = Boolean(onToggleOrder && onToggleAll && selectedIds);
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const orderHref = (shopifyId: number) =>
    query ? `/orders/${shopifyId}?${query}` : `/orders/${shopifyId}`;
  const repeatCustomers = new Set(repeatEbayUsernames);

  function isRepeatCustomer(order: StoredOrder): boolean {
    const username = resolveEbayUsername(order);
    if (!username) {
      return false;
    }

    return repeatCustomers.has(normalizeEbayUsername(username));
  }

  const colSpan = 16 + (bulkMode ? 1 : 0);

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/60 hover:bg-transparent">
          {bulkMode ? (
            <TableHead className="w-12 pl-6">
              <input
                type="checkbox"
                aria-label="Select all orders"
                checked={allSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = someSelected;
                  }
                }}
                onChange={(e) => onToggleAll?.(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
            </TableHead>
          ) : null}
          <TableHead className={bulkMode ? undefined : "pl-6"}>Order</TableHead>
          <TableHead className="min-w-[10rem]">Product</TableHead>
          <TableHead>Buyer</TableHead>
          <TableHead>Channel</TableHead>
          <TableHead>Carrier</TableHead>
          <TableHead>Tracking</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Items</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
          <TableHead className="text-right">Product cost</TableHead>
          <TableHead className="text-right">Postage</TableHead>
          <TableHead className="text-right">eBay fees</TableHead>
          <TableHead className="text-right">Ads fee</TableHead>
          <TableHead className="text-right">Total cost</TableHead>
          <TableHead className="pr-6 text-right">Profit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={colSpan}
              className="h-24 text-center text-muted-foreground"
            >
              No matching orders. Try another date range, sales channel, or sync
              from Shopify.
            </TableCell>
          </TableRow>
        ) : (
          orders.map((order, i) => {
            const costsIncomplete = isOrderCostsIncomplete(order);
            const costStatus = getOrderCostFieldStatus(order);
            const hasActualEbayFees =
              costStatus.isEbay &&
              order.ebayFeesActual != null &&
              order.ebayFeesActual >= 0;
            const isSelected = selectedIds?.has(order.shopifyId) ?? false;
            const productDisplay = getOrderProductDisplay(order, productFilter);
            const customerKey = getCustomerKey(order);

            return (
              <TableRow
                key={order.shopifyId}
                role={bulkMode ? undefined : "link"}
                tabIndex={bulkMode ? undefined : 0}
                className={cn(
                  "transition-colors",
                  bulkMode ? "" : "cursor-pointer",
                  isSelected && "bg-violet-500/10",
                  costsIncomplete && !isSelected
                    ? "border-red-500/30 bg-red-500/10 hover:bg-red-500/15"
                    : cn(
                        !isSelected && (bulkMode ? "hover:bg-muted/40" : "hover:bg-primary/5"),
                        !isSelected &&
                          (i % 2 === 0
                            ? "border-border/40 bg-muted/20"
                            : "border-border/40"),
                      ),
                )}
                onClick={
                  bulkMode
                    ? undefined
                    : () => router.push(orderHref(order.shopifyId))
                }
                onKeyDown={
                  bulkMode
                    ? undefined
                    : (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(orderHref(order.shopifyId));
                        }
                      }
                }
              >
                {bulkMode && onToggleOrder ? (
                  <TableCell
                    className="w-12 pl-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${order.orderNumber}`}
                      checked={isSelected}
                      onChange={(e) =>
                        onToggleOrder(order.shopifyId, e.target.checked)
                      }
                      className="size-4 rounded border-input accent-primary"
                    />
                  </TableCell>
                ) : null}
                <TableCell
                  className={cn(
                    "text-base font-semibold text-primary",
                    !bulkMode && "pl-6",
                  )}
                >
                  {bulkMode ? (
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => router.push(orderHref(order.shopifyId))}
                    >
                      {order.orderNumber}
                    </button>
                  ) : (
                    order.orderNumber
                  )}
                </TableCell>
                <TableCell className="min-w-0 max-w-[18rem] whitespace-normal align-top">
                  {productDisplay.primary ? (
                    <div className="space-y-1">
                      <p
                        className="line-clamp-2 break-words text-sm leading-snug text-foreground"
                        title={productDisplay.allTitles.join("\n")}
                      >
                        {productDisplay.primary}
                      </p>
                      {productDisplay.extraCount > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          +{productDisplay.extraCount} more item
                          {productDisplay.extraCount === 1 ? "" : "s"}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[12rem]">
                  <div className="flex flex-col gap-1.5">
                    {order.buyerName ? (
                      customerKey ? (
                        <Link
                          href={customerHref(encodeCustomerId(customerKey))}
                          className="truncate text-base font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {order.buyerName}
                        </Link>
                      ) : (
                        <span className="truncate text-base">
                          {order.buyerName}
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {isRepeatCustomer(order) ? (
                      <Badge
                        variant="secondary"
                        className="w-fit border-sky-500/30 bg-sky-500/10 px-2 py-0 text-xs font-semibold text-sky-800 dark:text-sky-300"
                      >
                        Repeat customer
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <OrderTags tags={order.tags} />
                </TableCell>
                <TableCell>
                  <ShippingCarrier
                    carrier={order.shippingCarrier}
                    service={order.shippingService}
                  />
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <OrderTracking
                      numbers={order.trackingNumbers ?? []}
                      url={order.trackingUrl}
                      shipmentStatus={order.shipmentStatus}
                    />
                    <OnTimeDeliveryBadge order={order} />
                  </div>
                </TableCell>
                <TableCell className="text-base text-muted-foreground">
                  {formatOrderDate(order.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="px-2.5 py-0.5 text-sm capitalize"
                  >
                    {order.financialStatus.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {order.itemCount}
                </TableCell>
                <TableCell className="text-right">
                  <MoneyCell amount={order.revenue} currency={order.currency} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <ProductCostCell
                    amount={order.productCost}
                    currency={order.currency}
                    missing={costStatus.productCostMissing}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <ProductCostCell
                    amount={order.shippingLabelCost}
                    currency={order.currency}
                    missing={costStatus.postageMissing}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <EbayFeeCell
                    actualAmount={
                      hasActualEbayFees
                        ? order.ebayFeesActual != null &&
                          order.ebayAdsFeeActual != null
                          ? Math.max(
                              0,
                              order.ebayFeesActual - order.ebayAdsFeeActual,
                            )
                          : order.ebayFeesActual
                        : null
                    }
                    rate={null}
                    currency={order.currency}
                    missing={costStatus.ebayFeeMissing}
                    notApplicable={!costStatus.isEbay}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <EbayFeeCell
                    actualAmount={
                      hasActualEbayFees ? (order.ebayAdsFeeActual ?? 0) : null
                    }
                    rate={null}
                    currency={order.currency}
                    missing={costStatus.isEbay && !hasActualEbayFees}
                    notApplicable={!costStatus.isEbay}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyCell
                    amount={costsIncomplete ? null : order.cost}
                    currency={order.currency}
                  />
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <MoneyCell
                    amount={costsIncomplete ? null : order.profit}
                    currency={order.currency}
                    emphasize={!costsIncomplete}
                    className={
                      costsIncomplete ? "text-destructive" : undefined
                    }
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
