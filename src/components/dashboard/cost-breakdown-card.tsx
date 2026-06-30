import { MoneyCell } from "@/components/orders/money-cell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { summarizeOrders } from "@/lib/orders/filtered-orders";
import { formatAmazonSubscriptionLabel } from "@/lib/orders/amazon-subscription";
import {
  formatAmazonFeeLabel,
  formatEbayFinalValueFeeSchedule,
} from "@/lib/orders/platform-fees";
import { cn } from "@/lib/utils";

type CostBreakdownCardProps = {
  summary: ReturnType<typeof summarizeOrders>;
  rangeLabel: string;
  orderCount: number;
};

type BreakdownRow = {
  label: string;
  amount: number;
  hint?: string;
  barClass: string;
  emphasize?: "cost" | "profit" | "revenue";
};

function BreakdownLine({
  row,
  currency,
  revenue,
}: {
  row: BreakdownRow;
  currency: string;
  revenue: number;
}) {
  const share = revenue > 0 ? (Math.abs(row.amount) / revenue) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={cn(
              "text-base font-medium",
              row.emphasize === "profit" && "text-primary",
              row.emphasize === "revenue" && "font-semibold",
            )}
          >
            {row.label}
          </p>
          {row.hint ? (
            <p className="text-sm text-muted-foreground">{row.hint}</p>
          ) : null}
        </div>
        <p
          className={cn(
            "shrink-0 text-base font-semibold tabular-nums",
            row.emphasize === "profit" && "text-primary",
            row.emphasize === "cost" && row.amount > 0 && "text-foreground",
          )}
        >
          {row.emphasize === "cost" && row.amount > 0 ? "−" : ""}
          {formatMoney(row.amount, currency)}
        </p>
      </div>
      {revenue > 0 && row.emphasize !== "revenue" ? (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", row.barClass)}
            style={{ width: `${Math.min(Math.max(share, row.amount > 0 ? 2 : 0), 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function CostBreakdownCard({
  summary,
  rangeLabel,
  orderCount,
}: CostBreakdownCardProps) {
  const {
    currency,
    revenue,
    productCost,
    postageCost,
    amazonPlatformFee,
    ebaySellingFees,
    ebayAdsFees,
    ebayOrders,
    ebayOrdersWithSellingFee,
    ebayOrdersWithAdsFee,
    ebayOrdersWithActualFees,
    amazonSubscription,
    totalCost,
    profit,
  } = summary;

  const hasCostData =
    summary.ordersWithProfit > 0 ||
    summary.amazonSubscription > 0 ||
    ebaySellingFees > 0 ||
    ebayAdsFees > 0;

  const rows: BreakdownRow[] = [
    {
      label: "Revenue",
      amount: revenue,
      hint: `${orderCount} orders in ${rangeLabel.toLowerCase()}`,
      barClass: "bg-primary",
      emphasize: "revenue",
    },
    {
      label: "Product cost",
      amount: productCost,
      hint:
        summary.ordersWithProductCost > 0
          ? `${summary.ordersWithProductCost} orders with SKU costs · ${summary.ordersMissingProductCost} missing`
          : "Add unit costs on the Products page",
      barClass: "bg-violet-500",
      emphasize: "cost",
    },
    {
      label: "Postage (Shopify labels)",
      amount: postageCost,
      hint:
        summary.ordersWithPostage > 0
          ? `${summary.ordersWithPostage} orders with label cost · ${summary.ordersMissingPostage} without`
          : "Sync orders to pull Shopify label costs",
      barClass: "bg-amber-500",
      emphasize: "cost",
    },
    ...(ebayOrders > 0
      ? [
          {
            label: "eBay fees",
            amount: ebaySellingFees,
            hint:
              ebayOrdersWithActualFees > 0
                ? `Actual fees from eBay Finances API · ${ebayOrdersWithActualFees} of ${ebayOrders} eBay orders`
                : ebayOrdersWithSellingFee > 0
                  ? `Selling fees incl. VAT + tiered FVF (${formatEbayFinalValueFeeSchedule()}) · ${ebayOrdersWithSellingFee} of ${ebayOrders} eBay orders`
                  : `${ebayOrders} eBay orders · add selling fee % on orders to include percentage fees`,
            barClass: "bg-sky-500",
            emphasize: "cost" as const,
          },
          {
            label: "eBay ads fees",
            amount: ebayAdsFees,
            hint:
              ebayOrdersWithAdsFee > 0
                ? `Ads fees incl. VAT · ${ebayOrdersWithAdsFee} of ${ebayOrders} eBay orders`
                : `${ebayOrders} eBay orders · add ads fee % where promoted listings apply`,
            barClass: "bg-sky-400",
            emphasize: "cost" as const,
          },
        ]
      : []),
    ...(amazonPlatformFee > 0
      ? [
          {
            label: formatAmazonFeeLabel(),
            amount: amazonPlatformFee,
            hint: `${summary.ordersWithAmazonPlatformFee} Amazon orders`,
            barClass: "bg-yellow-500",
            emphasize: "cost" as const,
          },
        ]
      : []),
    ...(amazonSubscription > 0
      ? [
          {
            label: formatAmazonSubscriptionLabel(),
            amount: amazonSubscription,
            hint: summary.amazonSubscriptionHint,
            barClass: "bg-amber-600",
            emphasize: "cost" as const,
          },
        ]
      : []),
    {
      label: "Total costs",
      amount: totalCost,
      hint: "Product cost + postage + eBay/Amazon fees + subscription",
      barClass: "bg-orange-500",
      emphasize: "cost",
    },
    {
      label: "Profit",
      amount: profit,
      hint:
        summary.marginPercent != null
          ? `${summary.marginPercent.toFixed(1)}% margin · ${summary.ordersWithProfit} orders with full cost data`
          : `${summary.ordersWithProfit} orders with cost data`,
      barClass: "bg-emerald-500",
      emphasize: "profit",
    },
  ];

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>Cost breakdown</CardTitle>
        <CardDescription>
          Revenue and costs for {rangeLabel.toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasCostData ? (
          <p className="text-base text-muted-foreground">
            No cost data in this period yet. Sync orders for postage costs and
            set product costs on the Products page.
          </p>
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="divide-y divide-border/60">
              {rows.map((row) => (
                <div key={row.label} className="py-4 first:pt-0 last:pb-0">
                  <BreakdownLine row={row} currency={currency} revenue={revenue} />
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </p>
              <dl className="mt-4 space-y-3 text-base">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Revenue</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatMoney(revenue, currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Product cost</dt>
                  <dd className="tabular-nums">
                    {productCost > 0 ? (
                      `−${formatMoney(productCost, currency)}`
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Postage</dt>
                  <dd className="tabular-nums">
                    {postageCost > 0 ? (
                      `−${formatMoney(postageCost, currency)}`
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                {ebayOrders > 0 ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">eBay fees</dt>
                      <dd className="tabular-nums">
                        {ebaySellingFees > 0 ? (
                          `−${formatMoney(ebaySellingFees, currency)}`
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">eBay ads fees</dt>
                      <dd className="tabular-nums">
                        {ebayAdsFees > 0 ? (
                          `−${formatMoney(ebayAdsFees, currency)}`
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </>
                ) : null}
                {amazonPlatformFee > 0 ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{formatAmazonFeeLabel()}</dt>
                    <dd className="tabular-nums">
                      −{formatMoney(amazonPlatformFee, currency)}
                    </dd>
                  </div>
                ) : null}
                {amazonSubscription > 0 ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">
                      {formatAmazonSubscriptionLabel()}
                    </dt>
                    <dd className="tabular-nums">
                      −{formatMoney(amazonSubscription, currency)}
                    </dd>
                  </div>
                ) : null}
                <div className="border-t border-border/60 pt-3">
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium">Profit</dt>
                    <dd className="text-lg font-bold text-primary tabular-nums">
                      <MoneyCell amount={profit} currency={currency} emphasize />
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
