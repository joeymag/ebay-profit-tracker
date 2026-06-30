import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AmazonOrderCostsForm } from "@/components/orders/amazon-order-costs-form";
import { CustomerHistoryCard } from "@/components/orders/customer-history-card";
import { DeleteOrderButton } from "@/components/orders/delete-order-button";
import { DesiredProfitCalculator } from "@/components/orders/desired-profit-calculator";
import { EbayOrderCostsForm } from "@/components/orders/ebay-order-costs-form";
import { LineItemImage } from "@/components/orders/line-item-image";
import { MoneyCell } from "@/components/orders/money-cell";
import { OrderTags } from "@/components/orders/order-tags";
import { OnTimeDeliveryBadge } from "@/components/orders/on-time-delivery-badge";
import { OrderTracking } from "@/components/orders/order-tracking";
import { ShippingCarrier } from "@/components/orders/shipping-carrier";
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
import { formatMoney, formatDeliveryDate, formatOrderDate } from "@/lib/format";
import { getSalesChannel } from "@/lib/orders/channel";
import type { CustomerHistory } from "@/lib/orders/customer-history";
import { resolveEbayUsername } from "@/lib/orders/ebay-buyer";
import { amazonSellerCentralOrderUrl } from "@/lib/shopify/amazon-order-id";
import { ebaySellerHubOrderUrl } from "@/lib/shopify/ebay-note-attributes";
import {
  isBracketDerivedSku,
  resolveLineItemSkuForDisplay,
} from "@/lib/orders/line-item-sku";
import {
  computeEbayFees,
  formatAmazonFeeLabel,
  formatEbayAdsFeeLabel,
  formatEbayAdsFeeVatLabel,
  formatEbayFeeLabel,
  formatEbayFinalValueFeeLabel,
  formatEbaySellingFeeVatLabel,
} from "@/lib/orders/platform-fees";
import {
  formatProductCostVatLabel,
  getProductCostBreakdown,
} from "@/lib/orders/product-cost-vat";
import { isOrderCancelled } from "@/lib/orders/order-status";
import { formatShippingAddressLines, getShippingPhone, phoneTelHref } from "@/lib/orders/shipping-address";
import type { StoredOrder } from "@/lib/orders/types";
import { cn } from "@/lib/utils";

type OrderDetailViewProps = {
  order: StoredOrder;
  backHref?: string;
  customerHistory?: CustomerHistory | null;
  detailQuery?: string;
};

function DetailRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-base text-muted-foreground">{label}</span>
      <span
        className={
          emphasize
            ? "text-lg font-semibold tabular-nums"
            : "text-base font-medium tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function OrderDetailView({
  order,
  backHref = "/orders",
  customerHistory,
  detailQuery,
}: OrderDetailViewProps) {
  const { currency } = order;
  const addressLines = formatShippingAddressLines(order.shippingAddress);
  const shippingPhone = getShippingPhone(order.shippingAddress);
  const ebayUsername = resolveEbayUsername(order);
  const channel = getSalesChannel(order.tags);
  const isEbay = channel === "eBay";
  const isAmazon = channel === "Amazon";
  const deliverByAt = isAmazon
    ? order.amazonDeliverByAt
    : isEbay
      ? order.ebayDeliverByAt
      : null;
  const cancelled = isOrderCancelled(order.financialStatus);

  const ebayFees = isEbay
    ? computeEbayFees(
        order.revenue,
        order.ebayFeeRate,
        order.ebayAdsFeeRate,
        order.ebayFeesActual,
        order.ebayAdsFeeActual,
      )
    : null;
  const hasActualEbayFees =
    isEbay && order.ebayFeesActual != null && order.ebayFeesActual >= 0;

  const platformFeeLabel =
    order.platformFee != null && order.platformFee > 0 && !isEbay
      ? formatAmazonFeeLabel()
      : null;
  const productCostBreakdown = getProductCostBreakdown(order);

  return (
    <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={backHref}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "w-fit gap-2",
          )}
        >
          <ArrowLeft className="size-4" />
          Back to orders
        </Link>
        <DeleteOrderButton
          shopifyId={order.shopifyId}
          orderNumber={order.orderNumber}
          backHref={backHref}
          cancelled={cancelled}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="surface-card lg:col-span-2">
          <CardHeader>
            <CardTitle>Line items</CardTitle>
            <CardDescription>
              {order.lineItems.length} product
              {order.lineItems.length === 1 ? "" : "s"} · {order.itemCount} unit
              {order.itemCount === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 pl-6" />
                  <TableHead className="w-[38%]">Product</TableHead>
                  <TableHead className="w-[14%]">SKU</TableHead>
                  <TableHead className="w-12 text-right">Qty</TableHead>
                  <TableHead className="w-24 text-right">Unit price</TableHead>
                  <TableHead className="w-24 text-right">Unit cost</TableHead>
                  <TableHead className="w-24 pr-6 text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lineItems.map((item) => {
                  const displaySku = resolveLineItemSkuForDisplay(
                    item.sku,
                    item.title,
                  );
                  const skuFromTitle = isBracketDerivedSku(item.sku, item.title);

                  return (
                  <TableRow key={item.id}>
                    <TableCell className="pl-6 align-top">
                      <LineItemImage src={item.imageUrl} alt={item.title} />
                    </TableCell>
                    <TableCell className="min-w-0 whitespace-normal align-top text-base font-medium">
                      <p className="break-words leading-snug">{item.title}</p>
                    </TableCell>
                    <TableCell className="align-top font-mono text-sm whitespace-normal">
                      {displaySku ? (
                        <span
                          className="inline-block max-w-full break-words rounded-md bg-muted px-2 py-1 text-foreground"
                          title={
                            skuFromTitle
                              ? "SKU derived from variant text in title"
                              : undefined
                          }
                        >
                          {displaySku}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(item.price, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.unitCost != null ? (
                        formatMoney(item.unitCost, currency)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-medium">
                      {formatMoney(item.price * item.quantity, currency)}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Order info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Buyer
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {order.buyerName ?? "—"}
                </p>
                {ebayUsername ? (
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    eBay: {ebayUsername}
                  </p>
                ) : null}
                {isEbay && order.ebayOrderId ? (
                  <p className="mt-1 font-mono text-sm">
                    eBay order:{" "}
                    <a
                      href={ebaySellerHubOrderUrl(
                        order.ebayOrderId,
                        order.shippingAddress?.countryCode ?? "GB",
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {order.ebayOrderId}
                    </a>
                  </p>
                ) : null}
                {isAmazon && order.amazonOrderId ? (
                  <p className="mt-1 font-mono text-sm">
                    Amazon:{" "}
                    <a
                      href={amazonSellerCentralOrderUrl(
                        order.amazonOrderId,
                        order.shippingAddress?.countryCode ?? "GB",
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {order.amazonOrderId}
                    </a>
                  </p>
                ) : null}
              </div>
              {addressLines.length || shippingPhone ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Ship to
                  </p>
                  {addressLines.length ? (
                    <address className="mt-1 space-y-0.5 text-base not-italic leading-relaxed">
                      {addressLines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </address>
                  ) : null}
                  {shippingPhone ? (
                    <p className={addressLines.length ? "mt-2" : "mt-1"}>
                      <a
                        href={phoneTelHref(shippingPhone)}
                        className="text-base font-medium text-primary hover:underline"
                      >
                        {shippingPhone}
                      </a>
                    </p>
                  ) : null}
                  {order.geocodeRegion ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Area: {order.geocodeRegion}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Date
                </p>
                <p className="mt-1 text-base">
                  {formatOrderDate(order.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "capitalize",
                    cancelled &&
                      "border-destructive/40 bg-destructive/10 text-destructive",
                  )}
                >
                  {order.financialStatus.replace(/_/g, " ")}
                </Badge>
                {order.fulfillmentStatus ? (
                  <Badge variant="secondary" className="capitalize">
                    {order.fulfillmentStatus.replace(/_/g, " ")}
                  </Badge>
                ) : null}
              </div>
              {order.tags ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Channel
                  </p>
                  <OrderTags tags={order.tags} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Shipping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ShippingCarrier
                carrier={order.shippingCarrier}
                service={order.shippingService}
              />
              {deliverByAt ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Deliver by
                  </p>
                  <p className="mt-1 text-base font-medium">
                    {formatDeliveryDate(deliverByAt)}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Tracking
                </p>
                <OrderTracking
                  numbers={order.trackingNumbers ?? []}
                  url={order.trackingUrl}
                  shipmentStatus={order.shipmentStatus}
                />
                <div className="mt-2">
                  <OnTimeDeliveryBadge order={order} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {isEbay ? (
        <EbayOrderCostsForm
          shopifyId={order.shopifyId}
          revenue={order.revenue}
          currency={currency}
          initialFeeRatePercent={
            order.ebayFeeRate != null ? order.ebayFeeRate * 100 : null
          }
          initialAdsFeeRatePercent={
            order.ebayAdsFeeRate != null ? order.ebayAdsFeeRate * 100 : null
          }
          initialPostageCost={order.shippingLabelCost}
          initialProductCostExVat={order.productCost}
          ebayFeesActual={order.ebayFeesActual}
          ebayAdsFeeActual={order.ebayAdsFeeActual}
          ebayFeesSyncedAt={order.ebayFeesSyncedAt}
        />
      ) : isAmazon ? (
        <AmazonOrderCostsForm
          shopifyId={order.shopifyId}
          currency={currency}
          initialPostageCost={order.shippingLabelCost}
          initialProductCost={order.productCost}
        />
      ) : null}

      {customerHistory ? (
        <CustomerHistoryCard
          history={customerHistory}
          detailQuery={detailQuery}
        />
      ) : null}

      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Financial summary</CardTitle>
          <CardDescription>
            Revenue, costs, and profit for this order
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="divide-y divide-border/60">
              <DetailRow
                label="Subtotal"
                value={formatMoney(order.subtotal, currency)}
              />
              <DetailRow
                label="Tax"
                value={formatMoney(order.tax, currency)}
              />
              <DetailRow
                label="Shipping charged"
                value={formatMoney(order.shippingCharged, currency)}
              />
              <DetailRow
                label="Order total (revenue)"
                value={formatMoney(order.revenue, currency)}
                emphasize
              />
            </div>
            <div className="divide-y divide-border/60">
              <DetailRow
                label={isEbay || isAmazon ? "Postage cost" : "Postage label cost"}
                value={
                  order.shippingLabelCost != null ? (
                    formatMoney(order.shippingLabelCost, currency)
                  ) : (
                    "—"
                  )
                }
              />
              {productCostBreakdown.exVat != null ? (
                <>
                  <DetailRow
                    label={
                      isEbay || isAmazon
                        ? "Product cost (ex-VAT)"
                        : "Product cost"
                    }
                    value={formatMoney(productCostBreakdown.exVat, currency)}
                  />
                  {productCostBreakdown.vat != null ? (
                    <DetailRow
                      label={formatProductCostVatLabel()}
                      value={formatMoney(productCostBreakdown.vat, currency)}
                    />
                  ) : null}
                  {(isEbay || isAmazon) && productCostBreakdown.inclVat != null ? (
                    <DetailRow
                      label="Product cost (incl VAT)"
                      value={formatMoney(productCostBreakdown.inclVat, currency)}
                    />
                  ) : null}
                </>
              ) : (
                <DetailRow label="Product cost" value="—" />
              )}
              {hasActualEbayFees ? (
                <>
                  <DetailRow
                    label="eBay selling fees (from eBay API)"
                    value={formatMoney(
                      ebayFees?.sellingFee ?? order.ebayFeesActual!,
                      currency,
                    )}
                  />
                  {order.ebayAdsFeeActual != null &&
                  order.ebayAdsFeeActual > 0 ? (
                    <DetailRow
                      label="eBay ads fee (from eBay API)"
                      value={formatMoney(order.ebayAdsFeeActual, currency)}
                    />
                  ) : null}
                  <DetailRow
                    label="eBay fees total (from eBay API)"
                    value={formatMoney(order.ebayFeesActual!, currency)}
                  />
                </>
              ) : null}
              {!hasActualEbayFees && isEbay && ebayFees ? (
                <DetailRow
                  label={formatEbayFinalValueFeeLabel(order.revenue)}
                  value={formatMoney(ebayFees.finalValueFee, currency)}
                />
              ) : null}
              {!hasActualEbayFees && ebayFees?.sellingFeeExVat != null && order.ebayFeeRate != null ? (
                <DetailRow
                  label={formatEbayFeeLabel(order.ebayFeeRate)}
                  value={formatMoney(ebayFees.sellingFeeExVat, currency)}
                />
              ) : null}
              {!hasActualEbayFees && ebayFees?.sellingFeeVat != null ? (
                <DetailRow
                  label={formatEbaySellingFeeVatLabel()}
                  value={formatMoney(ebayFees.sellingFeeVat, currency)}
                />
              ) : null}
              {!hasActualEbayFees && ebayFees?.sellingFee != null && order.ebayFeeRate != null ? (
                <DetailRow
                  label="eBay selling fee (incl VAT)"
                  value={formatMoney(ebayFees.sellingFee, currency)}
                />
              ) : null}
              {!hasActualEbayFees && ebayFees?.adsFeeExVat != null && order.ebayAdsFeeRate != null ? (
                <DetailRow
                  label={formatEbayAdsFeeLabel(order.ebayAdsFeeRate)}
                  value={formatMoney(ebayFees.adsFeeExVat, currency)}
                />
              ) : null}
              {!hasActualEbayFees && ebayFees?.adsFeeVat != null ? (
                <DetailRow
                  label={formatEbayAdsFeeVatLabel()}
                  value={formatMoney(ebayFees.adsFeeVat, currency)}
                />
              ) : null}
              {!hasActualEbayFees && ebayFees?.adsFee != null && order.ebayAdsFeeRate != null ? (
                <DetailRow
                  label="eBay ads fee (incl VAT)"
                  value={formatMoney(ebayFees.adsFee, currency)}
                />
              ) : null}
              {platformFeeLabel ? (
                <DetailRow
                  label={platformFeeLabel}
                  value={formatMoney(order.platformFee!, currency)}
                />
              ) : null}
              <DetailRow
                label="Total cost"
                value={
                  order.cost != null ? (
                    formatMoney(order.cost, currency)
                  ) : (
                    "—"
                  )
                }
              />
              <DetailRow
                label="Profit"
                value={
                  order.profit != null ? (
                    <MoneyCell
                      amount={order.profit}
                      currency={currency}
                      emphasize
                    />
                  ) : (
                    <span className="text-destructive">—</span>
                  )
                }
                emphasize
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <DesiredProfitCalculator
        shopifyId={order.shopifyId}
        order={order}
        currency={currency}
      />
    </div>
  );
}
