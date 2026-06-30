"use client";

import { useMemo, useState } from "react";
import { Target } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { getSalesChannel } from "@/lib/orders/channel";
import {
  computeRequiredSellPrice,
  getSellPriceComparison,
  type PricingOrderInput,
} from "@/lib/orders/required-sell-price";
import { cn } from "@/lib/utils";

type DesiredProfitCalculatorProps = {
  shopifyId: number;
  order: PricingOrderInput;
  currency: string;
};

function parseMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function BreakdownRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasize ? "font-semibold text-foreground" : "font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function DesiredProfitCalculator({
  shopifyId,
  order,
  currency,
}: DesiredProfitCalculatorProps) {
  const channel = getSalesChannel(order.tags);
  const [profitInput, setProfitInput] = useState("");

  const desiredProfit = parseMoney(profitInput);

  const result = useMemo(() => {
    if (desiredProfit == null) {
      return null;
    }

    return computeRequiredSellPrice(order, desiredProfit);
  }, [order, desiredProfit]);

  const comparison = useMemo(() => {
    if (!result?.requiredSellPrice) {
      return null;
    }

    return getSellPriceComparison(order, result.requiredSellPrice);
  }, [order, result?.requiredSellPrice]);

  const percentageFees =
    result != null && result.variableFeeRate > 0
      ? `${(result.variableFeeRate * 100).toFixed(1)}% of sale price`
      : null;

  return (
    <Card className="surface-card border-violet-500/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="size-5 text-violet-500" />
          <CardTitle>Target sell price</CardTitle>
        </div>
        <CardDescription>
          Enter your desired profit per sale. We combine product cost, postage,
          and {channel === "eBay" ? "eBay fees (incl VAT)" : "platform fees"}{" "}
          to show the price you need to sell at.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-xs space-y-2">
          <label
            htmlFor={`desired-profit-${shopifyId}`}
            className="text-sm font-medium text-muted-foreground"
          >
            Desired profit per sale
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              £
            </span>
            <Input
              id={`desired-profit-${shopifyId}`}
              type="text"
              inputMode="decimal"
              placeholder="e.g. 5.00"
              value={profitInput}
              onChange={(e) => setProfitInput(e.target.value)}
              className="pl-8 text-right tabular-nums"
            />
          </div>
        </div>

        {profitInput.trim() && desiredProfit == null ? (
          <p className="text-sm text-destructive">
            Enter a valid profit amount (0 or more).
          </p>
        ) : null}

        {result?.error ? (
          <p className="text-sm text-destructive">{result.error}</p>
        ) : null}

        {result?.missingCosts.length ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium">Some costs are not set yet</p>
            <p className="mt-1 text-muted-foreground">
              Using £0.00 for: {result.missingCosts.join(", ")}. Set these on
              the order for a more accurate price.
            </p>
          </div>
        ) : null}

        {result?.requiredSellPrice != null && result.breakdownAtRequiredPrice ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-5">
              <p className="text-sm font-medium text-muted-foreground">
                To make {formatMoney(result.desiredProfit, currency)} profit,
                sell at
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {formatMoney(result.requiredSellPrice, currency)}
              </p>
              {percentageFees ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Includes {percentageFees} in platform fees
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">
                Cost breakdown at this price
              </p>
              <BreakdownRow
                label="Product cost"
                value={formatMoney(
                  result.breakdownAtRequiredPrice.productCost,
                  currency,
                )}
              />
              <BreakdownRow
                label="Postage"
                value={formatMoney(
                  result.breakdownAtRequiredPrice.postageCost,
                  currency,
                )}
              />
              {result.breakdownAtRequiredPrice.flatEbayFee > 0 ? (
                <BreakdownRow
                  label="eBay Final Value Fee"
                  value={formatMoney(
                    result.breakdownAtRequiredPrice.flatEbayFee,
                    currency,
                  )}
                />
              ) : null}
              {result.breakdownAtRequiredPrice.platformFees >
              result.breakdownAtRequiredPrice.flatEbayFee ? (
                <BreakdownRow
                  label={
                    channel === "Amazon"
                      ? "Amazon fee"
                      : "eBay selling & ads fees (incl VAT)"
                  }
                  value={formatMoney(
                    result.breakdownAtRequiredPrice.platformFees -
                      result.breakdownAtRequiredPrice.flatEbayFee,
                    currency,
                  )}
                />
              ) : null}
              <div className="my-2 border-t border-border/60" />
              <BreakdownRow
                label="Total cost"
                value={formatMoney(
                  result.breakdownAtRequiredPrice.totalCost,
                  currency,
                )}
                emphasize
              />
              <BreakdownRow
                label="Profit"
                value={formatMoney(
                  result.breakdownAtRequiredPrice.profit,
                  currency,
                )}
                emphasize
              />
            </div>

            {comparison ? (
              <div className="rounded-lg border border-border/60 px-4 py-3 text-sm">
                <p className="font-medium text-foreground">This order sold at</p>
                <p className="mt-1 tabular-nums">
                  {formatMoney(comparison.currentRevenue, currency)}
                  {comparison.currentProfit != null ? (
                    <span className="text-muted-foreground">
                      {" "}
                      → {formatMoney(comparison.currentProfit, currency)} profit
                    </span>
                  ) : null}
                </p>
                <p
                  className={cn(
                    "mt-2 font-medium tabular-nums",
                    comparison.meetsTarget
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {comparison.meetsTarget
                    ? `Above target by ${formatMoney(Math.abs(comparison.difference), currency)}`
                    : `Need ${formatMoney(Math.abs(comparison.difference), currency)} more to hit target`}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
