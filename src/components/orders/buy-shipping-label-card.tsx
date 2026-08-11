"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Package } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FulfillmentOrderOption = {
  id: string;
  status: string;
  fulfillable: boolean;
  destinationName: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
  locationName: string | null;
  lineItemCount: number;
  buyerDeliveryName: string | null;
  buyerServiceCode: string | null;
};

type OptionsResponse =
  | {
      ok: true;
      fulfillmentOrders: FulfillmentOrderOption[];
      shopifyAdminUrl: string | null;
      fulfillmentStatus: string | null;
    }
  | { ok: false; error: string; hint?: string };

type PurchaseResponse =
  | {
      ok: true;
      status: string;
      done: boolean;
      postageCost: number | null;
      labels: Array<{
        trackingNumber: string | null;
        trackingUrl: string | null;
        documentUrl: string | null;
      }>;
      message: string;
    }
  | { ok: false; error: string; hint?: string };

const PACKAGE_STORAGE_KEY = "shopify-label-package-defaults";

type PackageDefaults = {
  totalWeightGrams: string;
  packageWeightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
};

const DEFAULT_PACKAGE: PackageDefaults = {
  totalWeightGrams: "500",
  packageWeightGrams: "50",
  lengthCm: "20",
  widthCm: "15",
  heightCm: "10",
};

type BuyShippingLabelCardProps = {
  shopifyId: number;
  alreadyHasPostage: boolean;
};

export function BuyShippingLabelCard({
  shopifyId,
  alreadyHasPostage,
}: BuyShippingLabelCardProps) {
  const router = useRouter();
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsHint, setOptionsHint] = useState<string | null>(null);
  const [fulfillmentOrders, setFulfillmentOrders] = useState<
    FulfillmentOrderOption[]
  >([]);
  const [shopifyAdminUrl, setShopifyAdminUrl] = useState<string | null>(null);
  const [selectedFoId, setSelectedFoId] = useState("");
  const [pkg, setPkg] = useState<PackageDefaults>(DEFAULT_PACKAGE);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PACKAGE_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<PackageDefaults>;
      setPkg((current) => ({ ...current, ...parsed }));
    } catch {
      // Ignore private-mode / bad JSON.
    }
  }, []);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setOptionsError(null);
    setOptionsHint(null);

    try {
      const response = await fetch(
        `/api/shopify/orders/${shopifyId}/shipping-label`,
      );
      const payload = (await response.json()) as OptionsResponse;
      if (!payload.ok) {
        setFulfillmentOrders([]);
        setOptionsError(payload.error);
        setOptionsHint(payload.hint ?? null);
        return;
      }

      setFulfillmentOrders(payload.fulfillmentOrders);
      setShopifyAdminUrl(payload.shopifyAdminUrl);
      setSelectedFoId(payload.fulfillmentOrders[0]?.id ?? "");
    } catch {
      setOptionsError("Could not load shipping label options from Shopify.");
    } finally {
      setLoadingOptions(false);
    }
  }, [shopifyId]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  function updatePackage(patch: Partial<PackageDefaults>) {
    setPkg((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore.
      }
      return next;
    });
  }

  async function buyLabel() {
    setPurchasing(true);
    setError(null);
    setMessage(null);
    setLabelUrl(null);

    try {
      const response = await fetch(
        `/api/shopify/orders/${shopifyId}/shipping-label/purchase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fulfillmentOrderId: selectedFoId,
            totalWeightGrams: Number.parseFloat(pkg.totalWeightGrams),
            packageWeightGrams: Number.parseFloat(pkg.packageWeightGrams),
            lengthCm: Number.parseFloat(pkg.lengthCm),
            widthCm: Number.parseFloat(pkg.widthCm),
            heightCm: Number.parseFloat(pkg.heightCm),
            notifyCustomer,
          }),
        },
      );
      const payload = (await response.json()) as PurchaseResponse;

      if (!payload.ok) {
        setError(
          [payload.error, payload.hint].filter(Boolean).join(" — ") ||
            "Purchase failed.",
        );
        return;
      }

      const firstLabel = payload.labels[0];
      setLabelUrl(firstLabel?.documentUrl ?? null);
      setMessage(
        [
          payload.message,
          payload.postageCost != null
            ? `Postage cost saved: £${payload.postageCost.toFixed(2)}.`
            : null,
          firstLabel?.trackingNumber
            ? `Tracking: ${firstLabel.trackingNumber}.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
      router.refresh();
      await loadOptions();
    } catch {
      setError("Could not reach the shipping label purchase endpoint.");
    } finally {
      setPurchasing(false);
    }
  }

  const canPurchase =
    Boolean(selectedFoId) &&
    fulfillmentOrders.length > 0 &&
    !purchasing &&
    !loadingOptions;

  const selectedFo =
    fulfillmentOrders.find((fo) => fo.id === selectedFoId) ?? null;

  return (
    <Card className="surface-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5" />
              Buy shipping label
            </CardTitle>
            <CardDescription>
              Shopify&apos;s API cannot list live label prices or services
              here. Buying below purchases Shopify&apos;s default/cheapest
              rate. To compare carriers and costs, open the order in Shopify
              Admin.
              {alreadyHasPostage
                ? " This order already has a postage cost saved."
                : null}
            </CardDescription>
          </div>
          {shopifyAdminUrl ? (
            <a
              href={shopifyAdminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Open in Shopify
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingOptions ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading fulfillment options…
          </p>
        ) : optionsError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p>{optionsError}</p>
            {optionsHint ? (
              <p className="mt-2 text-muted-foreground">{optionsHint}</p>
            ) : null}
          </div>
        ) : fulfillmentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open fulfillment orders left to ship. If the order is already
            fulfilled, buy/reprint labels in Shopify Admin.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="label-fo">
                Fulfillment order
              </label>
              <select
                id="label-fo"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={selectedFoId}
                onChange={(event) => setSelectedFoId(event.target.value)}
                disabled={purchasing}
              >
                {fulfillmentOrders.map((fo) => (
                  <option key={fo.id} value={fo.id}>
                    {fo.lineItemCount} item
                    {fo.lineItemCount === 1 ? "" : "s"}
                    {fo.destinationCity ? ` → ${fo.destinationCity}` : ""}
                    {fo.destinationCountry ? `, ${fo.destinationCountry}` : ""}
                    {fo.locationName ? ` · from ${fo.locationName}` : ""}
                  </option>
                ))}
              </select>
              {selectedFo?.buyerDeliveryName || selectedFo?.buyerServiceCode ? (
                <p className="text-sm text-muted-foreground">
                  Buyer chose at checkout:{" "}
                  <span className="font-medium text-foreground">
                    {selectedFo.buyerDeliveryName ||
                      selectedFo.buyerServiceCode}
                  </span>
                  {selectedFo.buyerDeliveryName && selectedFo.buyerServiceCode
                    ? ` (${selectedFo.buyerServiceCode})`
                    : null}
                  . That is not a live Shopify Shipping rate quote.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No buyer delivery method on this fulfillment order. Live
                  carrier rates are only shown in Shopify Admin.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  ["totalWeightGrams", "Total weight (g)"],
                  ["packageWeightGrams", "Box weight (g)"],
                  ["lengthCm", "Length (cm)"],
                  ["widthCm", "Width (cm)"],
                  ["heightCm", "Height (cm)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor={`pkg-${key}`}>
                    {label}
                  </label>
                  <Input
                    id={`pkg-${key}`}
                    inputMode="decimal"
                    value={pkg[key]}
                    onChange={(event) =>
                      updatePackage({ [key]: event.target.value })
                    }
                    disabled={purchasing}
                    className="tabular-nums"
                  />
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifyCustomer}
                onChange={(event) => setNotifyCustomer(event.target.checked)}
                className="size-4 rounded border-input accent-primary"
                disabled={purchasing}
              />
              Notify customer after purchase
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void buyLabel()}
                disabled={!canPurchase}
              >
                {purchasing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Buying label…
                  </>
                ) : (
                  "Buy cheapest label"
                )}
              </Button>
              {shopifyAdminUrl ? (
                <a
                  href={shopifyAdminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    purchasing && "pointer-events-none opacity-50",
                  )}
                >
                  Compare rates in Shopify
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadOptions()}
                disabled={purchasing}
              >
                Refresh
              </Button>
            </div>
          </>
        )}

        {message ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            <p>{message}</p>
            {labelUrl ? (
              <a
                href={labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-medium underline underline-offset-2"
              >
                Open label PDF
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
