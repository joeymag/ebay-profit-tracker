"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import {
  calculateAmazonItemProfit,
  formatAmazonFeeLabel,
  formatProductCostVatLabel,
  PRODUCT_COST_VAT_RATE,
} from "@/lib/orders/amazon-profit-calculator";
import { cn } from "@/lib/utils";

const CURRENCY = "GBP";

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
  negative,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm tabular-nums",
          emphasize && "text-base font-semibold",
          negative && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MoneyField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          £
        </span>
        <Input
          id={id}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-8 tabular-nums"
        />
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AmazonFeeCalculatorPanel() {
  const [sellPrice, setSellPrice] = useState("");
  const [productCost, setProductCost] = useState("");
  const [postage, setPostage] = useState("");

  const result = useMemo(() => {
    const sell = parseMoney(sellPrice);
    const cost = parseMoney(productCost);
    const post = parseMoney(postage);

    if (sell == null || cost == null || post == null) {
      return null;
    }

    return calculateAmazonItemProfit({
      sellPrice: sell,
      productCostExVat: cost,
      postage: post,
    });
  }, [sellPrice, productCost, postage]);

  const hasInput = sellPrice.trim() || productCost.trim() || postage.trim();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="surface-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="size-5 text-amber-600 dark:text-amber-400" />
            Item details
          </CardTitle>
          <CardDescription>
            18.5% marketplace fee on sell price. Product cost is ex-VAT plus{" "}
            {(PRODUCT_COST_VAT_RATE * 100).toFixed(0)}% VAT on top.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <MoneyField
            id="amazon-sell-price"
            label="Sell price"
            hint="What the buyer pays (item price)"
            value={sellPrice}
            onChange={setSellPrice}
            placeholder="24.99"
          />
          <MoneyField
            id="amazon-product-cost"
            label="Product cost"
            hint="What you pay per unit (ex-VAT)"
            value={productCost}
            onChange={setProductCost}
            placeholder="7.00"
          />
          <MoneyField
            id="amazon-postage"
            label="Postage cost"
            hint="Label / shipping you pay"
            value={postage}
            onChange={setPostage}
            placeholder="2.80"
          />
        </CardContent>
      </Card>

      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Profit breakdown</CardTitle>
          <CardDescription>
            {result
              ? "Estimated profit after all costs"
              : hasInput
                ? "Fill in sell price, product cost, and postage to see profit"
                : "Enter values on the left to calculate"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-border/60 bg-muted/25 p-5">
                <p className="text-sm font-medium text-muted-foreground">
                  Your profit
                </p>
                <p
                  className={cn(
                    "mt-1 text-4xl font-bold tabular-nums tracking-tight",
                    result.profit >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive",
                  )}
                >
                  {formatMoney(result.profit, CURRENCY)}
                </p>
                {result.marginPercent != null ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {result.marginPercent.toFixed(1)}% margin on sell price
                  </p>
                ) : null}
              </div>

              <div className="divide-y divide-border/60 rounded-xl border border-border/60 px-4">
                <BreakdownRow
                  label="Sell price"
                  value={formatMoney(result.revenue, CURRENCY)}
                />
                <BreakdownRow
                  label="Product cost (ex-VAT)"
                  value={`− ${formatMoney(result.productCostExVat, CURRENCY)}`}
                  negative
                />
                <BreakdownRow
                  label={formatProductCostVatLabel()}
                  value={`− ${formatMoney(result.productCostVat, CURRENCY)}`}
                  negative
                />
                <BreakdownRow
                  label="Postage"
                  value={`− ${formatMoney(result.postage, CURRENCY)}`}
                  negative
                />
                <BreakdownRow
                  label={formatAmazonFeeLabel()}
                  value={`− ${formatMoney(result.amazonFee, CURRENCY)}`}
                  negative
                />
                <BreakdownRow
                  label="Total cost"
                  value={formatMoney(result.totalCost, CURRENCY)}
                  emphasize
                />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-6 text-center text-sm text-muted-foreground">
              {hasInput
                ? "Enter sell price, product cost, and postage with valid numbers."
                : "Start with sell price, product cost, and postage."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
