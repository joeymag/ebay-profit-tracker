"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import {
  PRODUCT_COST_VAT_RATE,
  productCostVatAmount,
} from "@/lib/orders/product-cost-vat";
import {
  formatEbayFinalValueFeeSchedule,
  getEbayPercentFeeBreakdown,
} from "@/lib/orders/platform-fees";
import { cn } from "@/lib/utils";

type EbayOrderCostsFormProps = {
  shopifyId: number;
  revenue: number;
  currency: string;
  initialFeeRatePercent: number | null;
  initialAdsFeeRatePercent: number | null;
  initialPostageCost: number | null;
  initialProductCostExVat: number | null;
  ebayFeesActual?: number | null;
  ebayAdsFeeActual?: number | null;
  ebayFeesSyncedAt?: string | null;
};

function parsePercent(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed.replace(/%/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

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

export function EbayOrderCostsForm({
  shopifyId,
  revenue,
  currency,
  initialFeeRatePercent,
  initialAdsFeeRatePercent,
  initialPostageCost,
  initialProductCostExVat,
  ebayFeesActual,
  ebayAdsFeeActual,
  ebayFeesSyncedAt,
}: EbayOrderCostsFormProps) {
  const hasActualEbayFees =
    ebayFeesActual != null && Number.isFinite(ebayFeesActual) && ebayFeesActual >= 0;
  const router = useRouter();
  const [feePercent, setFeePercent] = useState(
    initialFeeRatePercent != null ? String(initialFeeRatePercent) : "",
  );
  const [adsFeePercent, setAdsFeePercent] = useState(
    initialAdsFeeRatePercent != null ? String(initialAdsFeeRatePercent) : "",
  );
  const [postageCost, setPostageCost] = useState(
    initialPostageCost != null ? String(initialPostageCost) : "",
  );
  const [productCostExVat, setProductCostExVat] = useState(
    initialProductCostExVat != null ? String(initialProductCostExVat) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewFee = useMemo((): {
    exVat: number;
    vat: number;
    inclVat: number;
  } | null => {
    const rate = parsePercent(feePercent);
    if (rate == null) {
      return null;
    }
    const breakdown = getEbayPercentFeeBreakdown(revenue, rate / 100);
    if (
      breakdown.exVat == null ||
      breakdown.vat == null ||
      breakdown.inclVat == null
    ) {
      return null;
    }
    return {
      exVat: breakdown.exVat,
      vat: breakdown.vat,
      inclVat: breakdown.inclVat,
    };
  }, [feePercent, revenue]);

  const previewAdsFee = useMemo((): {
    exVat: number;
    vat: number;
    inclVat: number;
  } | null => {
    const rate = parsePercent(adsFeePercent);
    if (rate == null) {
      return null;
    }
    const breakdown = getEbayPercentFeeBreakdown(revenue, rate / 100);
    if (
      breakdown.exVat == null ||
      breakdown.vat == null ||
      breakdown.inclVat == null
    ) {
      return null;
    }
    return {
      exVat: breakdown.exVat,
      vat: breakdown.vat,
      inclVat: breakdown.inclVat,
    };
  }, [adsFeePercent, revenue]);

  const previewProductCost = useMemo(() => {
    const exVat = parseMoney(productCostExVat);
    if (exVat == null) {
      return null;
    }

    const vat = productCostVatAmount(exVat, "eBay");
    return {
      exVat,
      vat,
      inclVat: exVat + vat,
    };
  }, [productCostExVat]);

  async function saveCosts() {
    const feeRatePercent = parsePercent(feePercent);
    const adsFeeRatePercent = parsePercent(adsFeePercent);
    const postage = parseMoney(postageCost);
    const productCost = parseMoney(productCostExVat);

    if (feePercent.trim() && feeRatePercent == null) {
      setError("Enter a valid eBay selling fee % (0–100)");
      return;
    }

    if (adsFeePercent.trim() && adsFeeRatePercent == null) {
      setError("Enter a valid eBay ads fee % (0–100)");
      return;
    }

    if (postageCost.trim() && postage == null) {
      setError("Enter a valid postage cost");
      return;
    }

    if (productCostExVat.trim() && productCost == null) {
      setError("Enter a valid product cost");
      return;
    }

    const feeUnchanged =
      (feeRatePercent ?? null) === (initialFeeRatePercent ?? null);
    const adsFeeUnchanged =
      (adsFeeRatePercent ?? null) === (initialAdsFeeRatePercent ?? null);
    const postageUnchanged =
      (postage ?? null) === (initialPostageCost ?? null);
    const productUnchanged =
      (productCost ?? null) === (initialProductCostExVat ?? null);

    if (feeUnchanged && adsFeeUnchanged && postageUnchanged && productUnchanged) {
      return;
    }

    if (
      hasActualEbayFees &&
      !feePercent.trim() &&
      !adsFeePercent.trim() &&
      postageUnchanged &&
      productUnchanged
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const body: Record<string, number | null> = {
        shippingLabelCost: postage,
        productCost,
      };

      if (!hasActualEbayFees) {
        body.ebayFeeRatePercent = feeRatePercent;
        body.ebayAdsFeeRatePercent = adsFeeRatePercent;
      }

      const res = await fetch(`/api/orders/${shopifyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Save failed");
        return;
      }

      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
      <div>
        <p className="text-base font-semibold text-foreground">eBay costs</p>
        {hasActualEbayFees ? (
          <p className="mt-1 text-sm text-muted-foreground">
            eBay fees ({formatMoney(ebayFeesActual, currency)} total
            {ebayAdsFeeActual != null && ebayAdsFeeActual > 0
              ? ` · ${formatMoney(ebayAdsFeeActual, currency)} ads`
              : ""}
            ) are pulled from your connected eBay seller account
            {ebayFeesSyncedAt
              ? ` · last synced ${new Date(ebayFeesSyncedAt).toLocaleDateString("en-GB")}`
              : ""}
            . Enter product cost and postage below — profit uses the real eBay
            fee total.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Set eBay selling fee % (ex-VAT), ads fee % (ex-VAT), product cost
            (ex-VAT), and postage — or sync fees from eBay in Settings. Final
            Value Fee is {formatEbayFinalValueFeeSchedule()} per eBay order
            automatically when using manual fee %.
          </p>
        )}
      </div>

      <div
        className={cn(
          "grid gap-4",
          hasActualEbayFees
            ? "sm:grid-cols-2"
            : "sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        {!hasActualEbayFees ? (
        <>
        <div className="space-y-2">
          <label
            htmlFor={`ebay-fee-${shopifyId}`}
            className="text-sm font-medium text-muted-foreground"
          >
            eBay selling fee % (ex-VAT)
          </label>
          <div className="relative">
            <Input
              id={`ebay-fee-${shopifyId}`}
              type="text"
              inputMode="decimal"
              placeholder="e.g. 12.8"
              value={feePercent}
              onChange={(e) => {
                setFeePercent(e.target.value);
                setSaved(false);
                setError(null);
              }}
              className={cn("pr-8 text-right tabular-nums", error && "border-destructive")}
              disabled={saving}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
          {previewFee != null ? (
            <p className="text-sm text-muted-foreground">
              {formatMoney(previewFee.exVat, currency)} +{" "}
              {formatMoney(previewFee.vat, currency)} VAT ={" "}
              {formatMoney(previewFee.inclVat, currency)} total
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label
            htmlFor={`ebay-ads-fee-${shopifyId}`}
            className="text-sm font-medium text-muted-foreground"
          >
            eBay ads fee % (ex-VAT)
          </label>
          <div className="relative">
            <Input
              id={`ebay-ads-fee-${shopifyId}`}
              type="text"
              inputMode="decimal"
              placeholder="e.g. 2.0"
              value={adsFeePercent}
              onChange={(e) => {
                setAdsFeePercent(e.target.value);
                setSaved(false);
                setError(null);
              }}
              className={cn("pr-8 text-right tabular-nums", error && "border-destructive")}
              disabled={saving}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
          {previewAdsFee != null ? (
            <p className="text-sm text-muted-foreground">
              {formatMoney(previewAdsFee.exVat, currency)} +{" "}
              {formatMoney(previewAdsFee.vat, currency)} VAT ={" "}
              {formatMoney(previewAdsFee.inclVat, currency)} total
            </p>
          ) : null}
        </div>
        </>
        ) : null}

        <div className="space-y-2">
          <label
            htmlFor={`ebay-product-${shopifyId}`}
            className="text-sm font-medium text-muted-foreground"
          >
            Product cost (ex-VAT)
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              £
            </span>
            <Input
              id={`ebay-product-${shopifyId}`}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={productCostExVat}
              onChange={(e) => {
                setProductCostExVat(e.target.value);
                setSaved(false);
                setError(null);
              }}
              className={cn("pl-8 text-right tabular-nums", error && "border-destructive")}
              disabled={saving}
            />
          </div>
          {previewProductCost != null ? (
            <p className="text-sm text-muted-foreground">
              + {formatMoney(previewProductCost.vat, currency)} VAT ={" "}
              {formatMoney(previewProductCost.inclVat, currency)} total
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label
            htmlFor={`ebay-postage-${shopifyId}`}
            className="text-sm font-medium text-muted-foreground"
          >
            Postage cost
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              £
            </span>
            <Input
              id={`ebay-postage-${shopifyId}`}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={postageCost}
              onChange={(e) => {
                setPostageCost(e.target.value);
                setSaved(false);
                setError(null);
              }}
              className={cn("pl-8 text-right tabular-nums", error && "border-destructive")}
              disabled={saving}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={saveCosts} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save costs"
          )}
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-primary">
            <Check className="size-4" />
            Saved
          </span>
        ) : null}
        {error ? (
          <span className="text-sm text-destructive">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
