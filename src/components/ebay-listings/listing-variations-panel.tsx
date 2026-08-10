"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Loader2, Save, Upload } from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import type {
  EbayListingDetails,
  EbayListingVariation,
  EbayVariationEdit,
} from "@/lib/ebay/listing-details";
import {
  calculateEbayItemProfit,
  formatEbayFinalValueFeeSchedule,
  PRODUCT_COST_VAT_RATE,
} from "@/lib/orders/ebay-profit-calculator";
import { cn } from "@/lib/utils";

type DetailsResponse =
  | { ok: true; listing: EbayListingDetails }
  | { ok: false; error: string; code?: string; details?: string };

type ReviseResponse =
  | {
      ok: true;
      listingId: string;
      updatedCount: number;
      ack: string | null;
      warnings: string[];
    }
  | { ok: false; error: string; details?: string };

type DraftRow = {
  sku: string;
  price: string;
  unitCost: string;
  postage: string;
};

const SELLING_FEE_STORAGE_KEY = "ebay-listing-selling-fee-percent";
const DEFAULT_SELLING_FEE_PERCENT = "12.8";

function formatQty(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-GB");
}

function moneyDraft(value: number | null | undefined): string {
  return value != null ? String(value) : "";
}

function draftsFromVariations(variations: EbayListingVariation[]): DraftRow[] {
  return variations.map((row) => ({
    sku: row.sku ?? "",
    price: row.price != null ? String(row.price) : "",
    unitCost: moneyDraft(row.unitCost),
    postage: moneyDraft(row.postageCost),
  }));
}

function sameEbayDraft(a: DraftRow, b: DraftRow): boolean {
  return a.sku.trim() === b.sku.trim() && a.price.trim() === b.price.trim();
}

function parseMoneyInput(value: string): number | null {
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

function parsePercentInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

function feeEstimateTitle(fees: {
  finalValueFee: number;
  sellingFee: number | null;
  adsFee: number | null;
}): string {
  const parts = [`FVF ${formatMoney(fees.finalValueFee)}`];
  if (fees.sellingFee != null) {
    parts.push(`Selling ${formatMoney(fees.sellingFee)}`);
  }
  if (fees.adsFee != null) {
    parts.push(`Promo ${formatMoney(fees.adsFee)}`);
  }
  return parts.join(" · ");
}

function MoneyDraftInput({
  value,
  onChange,
  onBlur,
  disabled,
  currency = "GBP",
  placeholder = "0.00",
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  currency?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        {currency === "GBP" ? "£" : currency}
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        inputMode="decimal"
        placeholder={placeholder}
        className="pl-7 text-right tabular-nums"
        disabled={disabled}
      />
    </div>
  );
}

type ListingVariationsPanelProps = {
  listingId: string;
};

export function ListingVariationsPanel({ listingId }: ListingVariationsPanelProps) {
  const [listing, setListing] = useState<EbayListingDetails | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<Extract<DetailsResponse, { ok: false }> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCosts, setSavingCosts] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sellingFeePercent, setSellingFeePercent] = useState(
    DEFAULT_SELLING_FEE_PERCENT,
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SELLING_FEE_STORAGE_KEY);
      if (stored != null && stored.trim() !== "") {
        setSellingFeePercent(stored);
      }
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/details`,
      );
      const payload = (await response.json()) as DetailsResponse;

      if (!payload.ok) {
        setListing(null);
        setDrafts([]);
        setError(payload);
        return;
      }

      setListing(payload.listing);
      setDrafts(draftsFromVariations(payload.listing.variations));
    } catch {
      setListing(null);
      setDrafts([]);
      setError({
        ok: false,
        error: "Could not reach the listing details endpoint.",
      });
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const originals = useMemo(
    () => (listing ? draftsFromVariations(listing.variations) : []),
    [listing],
  );

  const dirtyIndexes = useMemo(() => {
    const indexes: number[] = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const original = originals[index];
      if (!draft || !original) {
        continue;
      }
      if (!sameEbayDraft(draft, original)) {
        indexes.push(index);
      }
    }
    return indexes;
  }, [drafts, originals]);

  const dirtyCostIndexes = useMemo(() => {
    if (!listing) {
      return [] as number[];
    }

    const indexes: number[] = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const variation = listing.variations[index];
      if (!draft || !variation) {
        continue;
      }

      const originalCost = moneyDraft(variation.unitCost);
      const originalPostage = moneyDraft(variation.postageCost);
      if (
        draft.unitCost.trim() !== originalCost.trim() ||
        draft.postage.trim() !== originalPostage.trim()
      ) {
        indexes.push(index);
      }
    }
    return indexes;
  }, [drafts, listing]);

  const stockTotal = useMemo(() => {
    if (!listing) {
      return 0;
    }

    return listing.variations.reduce(
      (sum, row) => sum + (row.quantityAvailable ?? 0),
      0,
    );
  }, [listing]);

  const feeEstimates = useMemo(() => {
    const sellingPercent = parsePercentInput(sellingFeePercent) ?? 0;
    const promoPercent = listing?.promoRatePercent ?? 0;

    return drafts.map((draft) => {
      const price = parseMoneyInput(draft.price);
      const unitCost = parseMoneyInput(draft.unitCost);
      if (price == null || unitCost == null) {
        return null;
      }

      return calculateEbayItemProfit({
        sellPrice: price,
        productCostExVat: unitCost,
        ebayFeeRatePercent: sellingPercent,
        ebayAdsFeeRatePercent: promoPercent,
        postage: parseMoneyInput(draft.postage) ?? 0,
      });
    });
  }, [drafts, listing?.promoRatePercent, sellingFeePercent]);

  function updateSellingFeePercent(value: string) {
    setSellingFeePercent(value);
    try {
      window.localStorage.setItem(SELLING_FEE_STORAGE_KEY, value);
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }

  function updateDraft(index: number, patch: Partial<DraftRow>) {
    setDrafts((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
    setSaveMessage(null);
    setSaveError(null);
  }

  async function saveRowCosts(
    index: number,
  ): Promise<{ ok: true; sku: string } | { ok: false; error: string }> {
    if (!listing) {
      return { ok: false, error: "Listing is not loaded." };
    }

    const draft = drafts[index];
    const variation = listing.variations[index];
    if (!draft || !variation) {
      return { ok: false, error: `Missing row ${index + 1}.` };
    }

    const sku = draft.sku.trim() || variation.sku?.trim() || "";
    if (!sku) {
      return {
        ok: false,
        error: `Add a SKU on row ${index + 1} before saving costs.`,
      };
    }

    const originalCost = moneyDraft(variation.unitCost);
    const originalPostage = moneyDraft(variation.postageCost);
    const costChanged = draft.unitCost.trim() !== originalCost.trim();
    const postageChanged = draft.postage.trim() !== originalPostage.trim();

    if (!costChanged && !postageChanged) {
      return { ok: true, sku };
    }

    const unitCostRaw = draft.unitCost.trim();
    const postageRaw = draft.postage.trim();
    const unitCost =
      unitCostRaw === "" ? null : Number.parseFloat(unitCostRaw);
    const defaultPostage =
      postageRaw === "" ? null : Number.parseFloat(postageRaw);

    if (
      unitCostRaw !== "" &&
      (unitCost == null || !Number.isFinite(unitCost) || unitCost < 0)
    ) {
      return { ok: false, error: `Invalid product cost on row ${index + 1}.` };
    }
    if (
      postageRaw !== "" &&
      (defaultPostage == null ||
        !Number.isFinite(defaultPostage) ||
        defaultPostage < 0)
    ) {
      return { ok: false, error: `Invalid postage on row ${index + 1}.` };
    }

    try {
      const response = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitCost: costChanged ? unitCost : undefined,
          defaultPostage: postageChanged ? defaultPostage : undefined,
          title: listing.title ?? variation.specifics,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        costs?: { unitCost: number | null; defaultPostage: number | null };
      };

      if (!payload.ok) {
        return {
          ok: false,
          error: payload.error ?? `Could not save costs for ${sku}.`,
        };
      }

      setListing((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          variations: current.variations.map((row, rowIndex) =>
            rowIndex === index
              ? {
                  ...row,
                  unitCost: costChanged
                    ? (payload.costs?.unitCost ?? null)
                    : row.unitCost,
                  postageCost: postageChanged
                    ? (payload.costs?.defaultPostage ?? null)
                    : row.postageCost,
                }
              : row,
          ),
        };
      });

      return { ok: true, sku };
    } catch {
      return { ok: false, error: `Could not save costs for ${sku}.` };
    }
  }

  async function saveCosts() {
    if (!listing || dirtyCostIndexes.length === 0) {
      return;
    }

    setSavingCosts(true);
    setSaveError(null);
    setSaveMessage(null);

    let savedCount = 0;

    try {
      for (const index of dirtyCostIndexes) {
        const result = await saveRowCosts(index);
        if (!result.ok) {
          setSaveError(result.error);
          return;
        }
        savedCount += 1;
      }

      setSaveMessage(
        `Saved cost/postage for ${savedCount} variation${savedCount === 1 ? "" : "s"}.`,
      );
    } finally {
      setSavingCosts(false);
    }
  }

  async function pushToEbay() {
    if (!listing || dirtyIndexes.length === 0) {
      return;
    }

    const updates: EbayVariationEdit[] = [];

    for (const index of dirtyIndexes) {
      const draft = drafts[index]!;
      const variation = listing.variations[index]!;
      const priceRaw = draft.price.trim();
      let price: number | null = null;

      if (priceRaw !== "") {
        price = Number.parseFloat(priceRaw);
        if (!Number.isFinite(price) || price < 0) {
          setSaveError(`Invalid price on row ${index + 1}.`);
          return;
        }
      } else {
        setSaveError(`Price is required on row ${index + 1}.`);
        return;
      }

      updates.push({
        originalSku: variation.sku,
        sku: draft.sku.trim() || null,
        price,
        specificsPairs: variation.specificsPairs,
      });
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/revise`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isMultiVariation: listing.isMultiVariation,
            format: listing.format,
            currency: listing.currency ?? "GBP",
            variations: updates,
          }),
        },
      );
      const payload = (await response.json()) as ReviseResponse;

      if (!payload.ok) {
        setSaveError(
          [payload.error, payload.details].filter(Boolean).join(" — "),
        );
        return;
      }

      const warningText = payload.warnings.length
        ? ` Warnings: ${payload.warnings.slice(0, 2).join(" · ")}`
        : "";
      setSaveMessage(
        `Pushed ${payload.updatedCount} update${payload.updatedCount === 1 ? "" : "s"} to eBay (${payload.ack ?? "Success"}).${warningText}`,
      );
      await load();
    } catch {
      setSaveError("Could not reach the eBay revise endpoint.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading variations from eBay…
      </div>
    );
  }

  if (error) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not load listing</CardTitle>
          <CardDescription>{error.error}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Link href="/ebay-listings" className={cn(buttonVariants({ variant: "outline" }))}>
              Back to listings
            </Link>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
          {error.details ? (
            <p className="font-mono text-xs text-muted-foreground">{error.details}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!listing) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/ebay-listings"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeft className="size-4" />
          All listings
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={saving || savingCosts}
        >
          Refresh
        </Button>
        <a
          href={listing.itemWebUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          Open on eBay
          <ExternalLink className="size-3.5" />
        </a>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void saveCosts()}
          disabled={saving || savingCosts || dirtyCostIndexes.length === 0}
        >
          {savingCosts ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving costs…
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save cost
              {dirtyCostIndexes.length > 0
                ? ` / postage (${dirtyCostIndexes.length})`
                : " / postage"}
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void pushToEbay()}
          disabled={saving || savingCosts || dirtyIndexes.length === 0}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Pushing to eBay…
            </>
          ) : (
            <>
              <Upload className="size-4" />
              Push {dirtyIndexes.length || ""} change
              {dirtyIndexes.length === 1 ? "" : "s"} to eBay
            </>
          )}
        </Button>
      </div>

      {saveMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>{saveMessage}</p>
        </div>
      ) : null}
      {saveError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {saveError}
        </div>
      ) : null}

      <Card className="surface-card">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap gap-4">
            <LineItemImage
              src={listing.imageUrl}
              alt={listing.title ?? listing.listingId}
              className="size-20"
            />
            <div className="min-w-0 space-y-2">
              <CardTitle className="text-xl leading-snug">
                {listing.title ?? `Listing ${listing.listingId}`}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{listing.listingId}</span>
                {listing.isMultiVariation ? (
                  <Badge variant="secondary">
                    {listing.variations.length} variations
                  </Badge>
                ) : (
                  <Badge variant="outline">Single SKU</Badge>
                )}
                {listing.promoRatePercent != null ? (
                  <Badge
                    variant="secondary"
                    className="tabular-nums"
                    title={listing.promoCampaignName ?? undefined}
                  >
                    Promo {listing.promoRatePercent.toFixed(
                      listing.promoRatePercent % 1 === 0 ? 0 : 1,
                    )}
                    %
                  </Badge>
                ) : (
                  <Badge variant="outline">No promo</Badge>
                )}
                {listing.status ? (
                  <Badge variant="outline">
                    {listing.status.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                ) : null}
                {dirtyCostIndexes.length > 0 ? (
                  <Badge variant="secondary">
                    {dirtyCostIndexes.length} cost unsaved
                  </Badge>
                ) : null}
                {dirtyIndexes.length > 0 ? (
                  <Badge variant="destructive">
                    {dirtyIndexes.length} eBay unsaved
                  </Badge>
                ) : null}
              </CardDescription>
              {listing.promoWarning ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {listing.promoWarning}{" "}
                  <Link href="/settings" className="underline underline-offset-2">
                    Settings
                  </Link>
                </p>
              ) : listing.promoCampaignName ? (
                <p className="text-sm text-muted-foreground">
                  Campaign: {listing.promoCampaignName}
                  {listing.promoAdStatus ? ` · ${listing.promoAdStatus}` : ""}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Total available stock across rows:{" "}
                <span className="tabular-nums text-foreground">
                  {stockTotal.toLocaleString("en-GB")}
                </span>
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="surface-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>
                {listing.isMultiVariation ? "Variations" : "Listing stock"}
              </CardTitle>
              <CardDescription>
                Enter product cost (ex-VAT) and postage for a rough profit
                before sale. Fees use FVF ({formatEbayFinalValueFeeSchedule()}
                ), selling fee % (+{(PRODUCT_COST_VAT_RATE * 100).toFixed(0)}%
                VAT), and this listing&apos;s promo rate. Click{" "}
                <span className="font-medium text-foreground">
                  Save cost / postage
                </span>{" "}
                when ready.
              </CardDescription>
            </div>
            <div className="w-full max-w-[11rem] space-y-1.5">
              <label
                htmlFor="listing-selling-fee"
                className="text-sm font-medium leading-none"
              >
                Selling fee %
              </label>
              <div className="relative">
                <Input
                  id="listing-selling-fee"
                  value={sellingFeePercent}
                  onChange={(event) =>
                    updateSellingFeePercent(event.target.value)
                  }
                  inputMode="decimal"
                  placeholder="12.8"
                  className="pr-7 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Variation</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="w-[8.5rem]">Price</TableHead>
                  <TableHead className="w-[8.5rem]">Cost ex-VAT</TableHead>
                  <TableHead className="w-[8.5rem]">Postage</TableHead>
                  <TableHead className="w-[7.5rem] text-right">Est. fees</TableHead>
                  <TableHead className="w-[7.5rem] text-right">Est. profit</TableHead>
                  <TableHead className="pr-6 text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.variations.map((row, index) => {
                  const draft = drafts[index] ?? {
                    sku: "",
                    price: "",
                    unitCost: "",
                    postage: "",
                  };
                  const dirty = dirtyIndexes.includes(index);
                  const currency = row.currency ?? listing.currency ?? "GBP";
                  const estimate = feeEstimates[index] ?? null;

                  return (
                    <TableRow
                      key={`${row.sku ?? "nosku"}-${index}`}
                      className={dirty ? "bg-amber-500/5" : undefined}
                    >
                      <TableCell className="min-w-0 whitespace-normal pl-6 align-top">
                        <p className="break-words text-sm font-medium leading-snug">
                          {row.specifics || "—"}
                        </p>
                        {dirty ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            Edited
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="min-w-[9rem] align-top whitespace-normal">
                        <Input
                          value={draft.sku}
                          onChange={(event) =>
                            updateDraft(index, { sku: event.target.value })
                          }
                          placeholder="SKU"
                          className="font-mono text-sm"
                          disabled={saving || savingCosts}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <MoneyDraftInput
                          value={draft.price}
                          currency={currency}
                          disabled={saving || savingCosts}
                          onChange={(value) =>
                            updateDraft(index, { price: value })
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <MoneyDraftInput
                          value={draft.unitCost}
                          currency={currency}
                          disabled={saving || savingCosts}
                          onChange={(value) =>
                            updateDraft(index, { unitCost: value })
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <MoneyDraftInput
                          value={draft.postage}
                          currency={currency}
                          disabled={saving || savingCosts}
                          onChange={(value) =>
                            updateDraft(index, { postage: value })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {estimate ? (
                          <div
                            className="space-y-0.5"
                            title={feeEstimateTitle(estimate.ebayFees)}
                          >
                            <p className="tabular-nums font-medium">
                              {formatMoney(estimate.ebayFees.total, currency)}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {estimate.ebayFees.adsFee != null
                                ? `incl. promo ${formatMoney(estimate.ebayFees.adsFee, currency)}`
                                : "no promo"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {estimate ? (
                          <div className="space-y-0.5">
                            <p
                              className={cn(
                                "tabular-nums font-semibold",
                                estimate.profit >= 0
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : "text-destructive",
                              )}
                            >
                              {formatMoney(estimate.profit, currency)}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {estimate.marginPercent != null
                                ? `${estimate.marginPercent.toFixed(1)}% margin`
                                : "—"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Add cost
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums align-middle font-medium">
                        {formatQty(row.quantityAvailable)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
