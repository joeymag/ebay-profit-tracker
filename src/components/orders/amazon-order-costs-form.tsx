"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmazonFeeLabel } from "@/lib/orders/platform-fees";
import {
  PRODUCT_COST_VAT_RATE,
} from "@/lib/orders/product-cost-vat";

type AmazonOrderCostsFormProps = {
  shopifyId: number;
  currency: string;
  initialPostageCost: number | null;
  initialProductCost: number | null;
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

export function AmazonOrderCostsForm({
  shopifyId,
  currency,
  initialPostageCost,
  initialProductCost,
}: AmazonOrderCostsFormProps) {
  const router = useRouter();
  const [postageCost, setPostageCost] = useState(
    initialPostageCost != null ? String(initialPostageCost) : "",
  );
  const [productCost, setProductCost] = useState(
    initialProductCost != null ? String(initialProductCost) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function saveCosts() {
    const postage = parseMoney(postageCost);
    const product = parseMoney(productCost);

    if (postageCost.trim() && postage == null) {
      setError("Enter a valid postage cost");
      return;
    }

    if (productCost.trim() && product == null) {
      setError("Enter a valid product cost");
      return;
    }

    const postageUnchanged =
      (postage ?? null) === (initialPostageCost ?? null);
    const productUnchanged =
      (product ?? null) === (initialProductCost ?? null);

    if (postageUnchanged && productUnchanged) {
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/orders/${shopifyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingLabelCost: postage,
          productCost: product,
        }),
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
    <div className="space-y-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div>
        <p className="text-base font-semibold text-foreground">Amazon costs</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter product cost ex-VAT and postage. Product cost adds{" "}
          {(PRODUCT_COST_VAT_RATE * 100).toFixed(0)}% VAT for profit
          calculations. {formatAmazonFeeLabel()} is calculated automatically
          from order revenue.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={`amazon-product-${shopifyId}`}
            className="text-sm font-medium text-muted-foreground"
          >
            Product cost ex-VAT ({currency})
          </label>
          <Input
            id={`amazon-product-${shopifyId}`}
            type="text"
            inputMode="decimal"
            placeholder="e.g. 12.50"
            value={productCost}
            onChange={(e) => {
              setProductCost(e.target.value);
              setSaved(false);
              setError(null);
            }}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={`amazon-postage-${shopifyId}`}
            className="text-sm font-medium text-muted-foreground"
          >
            Postage cost ({currency})
          </label>
          <Input
            id={`amazon-postage-${shopifyId}`}
            type="text"
            inputMode="decimal"
            placeholder="e.g. 3.25"
            value={postageCost}
            onChange={(e) => {
              setPostageCost(e.target.value);
              setSaved(false);
              setError(null);
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={saveCosts} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : saved ? (
            <>
              <Check className="size-4" />
              Saved
            </>
          ) : (
            "Save costs"
          )}
        </Button>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
