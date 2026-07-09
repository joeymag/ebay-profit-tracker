"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { productCostVatAmount } from "@/lib/orders/product-cost-vat";
import { cn } from "@/lib/utils";

type EbayOrderCostsFormProps = {
  shopifyId: number;
  currency: string;
  initialPostageCost: number | null;
  initialProductCostExVat: number | null;
  ebayFeesActual?: number | null;
  ebayAdsFeeActual?: number | null;
  ebayFeesSyncedAt?: string | null;
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

export function EbayOrderCostsForm({
  shopifyId,
  currency,
  initialPostageCost,
  initialProductCostExVat,
  ebayFeesActual,
  ebayAdsFeeActual,
  ebayFeesSyncedAt,
}: EbayOrderCostsFormProps) {
  const hasActualEbayFees =
    ebayFeesActual != null && Number.isFinite(ebayFeesActual) && ebayFeesActual >= 0;
  const sellingFees =
    hasActualEbayFees && ebayFeesActual != null
      ? Math.max(
          0,
          ebayFeesActual -
            (ebayAdsFeeActual != null && ebayAdsFeeActual > 0
              ? ebayAdsFeeActual
              : 0),
        )
      : null;

  const router = useRouter();
  const [postageCost, setPostageCost] = useState(
    initialPostageCost != null ? String(initialPostageCost) : "",
  );
  const [productCostExVat, setProductCostExVat] = useState(
    initialProductCostExVat != null ? String(initialProductCostExVat) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const postage = parseMoney(postageCost);
    const productCost = parseMoney(productCostExVat);

    if (postageCost.trim() && postage == null) {
      setError("Enter a valid postage cost");
      return;
    }

    if (productCostExVat.trim() && productCost == null) {
      setError("Enter a valid product cost");
      return;
    }

    const postageUnchanged =
      (postage ?? null) === (initialPostageCost ?? null);
    const productUnchanged =
      (productCost ?? null) === (initialProductCostExVat ?? null);

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
          productCost,
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
    <div className="space-y-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
      <div>
        <p className="text-base font-semibold text-foreground">eBay costs</p>
        {hasActualEbayFees ? (
          <p className="mt-1 text-sm text-muted-foreground">
            eBay fees are pulled from your connected seller account
            {ebayFeesSyncedAt
              ? ` · last synced ${new Date(ebayFeesSyncedAt).toLocaleDateString("en-GB")}`
              : ""}
            . Enter product cost and postage below.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            eBay selling and ads fees come from the eBay Finances API — sync them
            in{" "}
            <Link
              href="/settings"
              className="font-medium text-primary underline underline-offset-4"
            >
              Settings
            </Link>
            . Enter product cost and postage below.
          </p>
        )}
      </div>

      {hasActualEbayFees ? (
        <dl className="grid gap-3 rounded-lg border border-border/60 bg-background/60 p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">eBay selling fees</dt>
            <dd className="mt-1 font-semibold tabular-nums text-foreground">
              {sellingFees != null ? formatMoney(sellingFees, currency) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">eBay ads fees</dt>
            <dd className="mt-1 font-semibold tabular-nums text-foreground">
              {ebayAdsFeeActual != null && ebayAdsFeeActual > 0
                ? formatMoney(ebayAdsFeeActual, currency)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total eBay fees</dt>
            <dd className="mt-1 font-semibold tabular-nums text-foreground">
              {formatMoney(ebayFeesActual!, currency)}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
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
