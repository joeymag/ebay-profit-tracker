"use client";

import { useMemo, useState } from "react";
import { Package, Store, Warehouse } from "lucide-react";

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
  getLowPriceFbaUkOption,
  listLowPriceFbaUkOptions,
} from "@/lib/amazon/low-price-fba-fees";
import {
  calculateAmazonItemProfit,
  formatAmazonFeeLabel,
  formatAmazonFulfilmentCostLabel,
  formatProductCostVatLabel,
  PRODUCT_COST_VAT_RATE,
  type AmazonFulfilmentType,
} from "@/lib/orders/amazon-profit-calculator";
import { cn } from "@/lib/utils";

const CURRENCY = "GBP";
const FBA_UK_OPTIONS = listLowPriceFbaUkOptions();

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
  const [fulfilmentType, setFulfilmentType] =
    useState<AmazonFulfilmentType>("FBM");
  const [sellPrice, setSellPrice] = useState("");
  const [productCost, setProductCost] = useState("");
  const [fulfilmentCost, setFulfilmentCost] = useState("");
  const [fbaBandId, setFbaBandId] = useState("");

  const isFba = fulfilmentType === "FBA";
  const fbaOption = isFba && fbaBandId ? getLowPriceFbaUkOption(fbaBandId) : null;

  const effectiveFulfilmentCost = isFba
    ? (fbaOption?.feeGbp ?? null)
    : parseMoney(fulfilmentCost);

  const result = useMemo(() => {
    const sell = parseMoney(sellPrice);
    const cost = parseMoney(productCost);
    const fulfilment = effectiveFulfilmentCost;

    if (sell == null || cost == null || fulfilment == null) {
      return null;
    }

    return calculateAmazonItemProfit({
      sellPrice: sell,
      productCostExVat: cost,
      fulfilmentCost: fulfilment,
      fulfilmentType,
    });
  }, [sellPrice, productCost, effectiveFulfilmentCost, fulfilmentType]);

  const hasInput = isFba
    ? Boolean(sellPrice.trim() || productCost.trim() || fbaBandId)
    : Boolean(sellPrice.trim() || productCost.trim() || fulfilmentCost.trim());

  const fulfilmentLabel = formatAmazonFulfilmentCostLabel(fulfilmentType);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="surface-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {isFba ? (
                  <Warehouse className="size-5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Store className="size-5 text-amber-600 dark:text-amber-400" />
                )}
                Item details
              </CardTitle>
              <CardDescription className="mt-1.5">
                18.5% marketplace fee on sell price. Product cost is ex-VAT plus{" "}
                {(PRODUCT_COST_VAT_RATE * 100).toFixed(0)}% VAT on top.
                {isFba
                  ? " Pick Amazon’s Low-price FBA UK postage band from the list."
                  : " Uses the postage you pay to ship yourself."}
              </CardDescription>
            </div>
            <div
              className="flex rounded-lg border border-border/60 bg-muted/30 p-1"
              role="tablist"
              aria-label="Fulfilment type"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isFba}
                onClick={() => setFulfilmentType("FBM")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  !isFba
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Package className="size-3.5" />
                FBM
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isFba}
                onClick={() => setFulfilmentType("FBA")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isFba
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Warehouse className="size-3.5" />
                FBA
              </button>
            </div>
          </div>
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

          {isFba ? (
            <div className="space-y-2 sm:col-span-2">
              <label
                htmlFor="amazon-fba-band"
                className="text-sm font-medium leading-none"
              >
                Amazon postage band
              </label>
              <select
                id="amazon-fba-band"
                className="flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground [color-scheme:light]"
                value={fbaBandId}
                onChange={(event) => setFbaBandId(event.target.value)}
              >
                <option value="" className="bg-white text-zinc-900">
                  Select size tier and weight…
                </option>
                {FBA_UK_OPTIONS.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-white text-zinc-900"
                  >
                    {option.label}
                  </option>
                ))}
              </select>
              {fbaOption ? (
                <p className="text-xs text-muted-foreground">
                  Max size {optionSizeLabel(fbaOption)} · Low-price FBA UK ·{" "}
                  {formatMoney(fbaOption.feeGbp, CURRENCY)} postage
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Choose the matching Amazon Low-price FBA size and weight band.
                </p>
              )}
            </div>
          ) : (
            <MoneyField
              id="amazon-fulfilment-cost"
              label={fulfilmentLabel}
              hint="Label / shipping you pay"
              value={fulfilmentCost}
              onChange={setFulfilmentCost}
              placeholder="2.80"
            />
          )}
        </CardContent>
      </Card>

      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Profit breakdown</CardTitle>
          <CardDescription>
            {result
              ? `Estimated ${isFba ? "FBA" : "FBM"} profit after all costs`
              : hasInput
                ? isFba
                  ? "Fill in sell price, product cost, and a postage band to see profit"
                  : "Fill in sell price, product cost, and postage to see profit"
                : "Enter values on the left to calculate"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-border/60 bg-muted/25 p-5">
                <p className="text-sm font-medium text-muted-foreground">
                  Your profit ·{" "}
                  {isFba ? "Fulfilment by Amazon" : "Fulfilment by Merchant"}
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
                  label={
                    isFba && fbaOption
                      ? `Amazon postage (${fbaOption.tierLabel} · ≤ ${fbaOption.maxWeightG} g)`
                      : fulfilmentLabel
                  }
                  value={`− ${formatMoney(result.fulfilmentCost, CURRENCY)}`}
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
              {isFba ? (
                <p className="text-xs text-muted-foreground">
                  Uses Low-price FBA UK rates. Does not include monthly storage
                  or inbound placement fees.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-6 text-center text-sm text-muted-foreground">
              {hasInput
                ? isFba
                  ? "Enter sell price, product cost, and choose a postage band."
                  : "Enter sell price, product cost, and postage with valid numbers."
                : isFba
                  ? "Start with sell price, product cost, and an Amazon postage band."
                  : "Start with sell price, product cost, and postage."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function optionSizeLabel(option: {
  maxLongestCm: number;
  maxMedianCm: number;
  maxShortestCm: number;
}): string {
  return `≤ ${option.maxLongestCm} × ${option.maxMedianCm} × ${option.maxShortestCm} cm`;
}
