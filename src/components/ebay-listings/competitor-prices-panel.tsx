"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type {
  EbayCompetitorListingRow,
  OurListingSkuOption,
} from "@/lib/ebay/competitor-prices-shared";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type ListResponse =
  | {
      ok: true;
      competitors: EbayCompetitorListingRow[];
      ourSkus: OurListingSkuOption[];
    }
  | { ok: false; error: string };

type MutateResponse =
  | {
      ok: true;
      competitor?: EbayCompetitorListingRow;
      message?: string;
    }
  | { ok: false; error: string; details?: string };

type CompetitorPricesPanelProps = {
  listingId: string;
};

function priceDiff(
  ourPrice: number | null | undefined,
  competitorPrice: number | null | undefined,
): number | null {
  if (ourPrice == null || competitorPrice == null) {
    return null;
  }
  return ourPrice - competitorPrice;
}

export function CompetitorPricesPanel({ listingId }: CompetitorPricesPanelProps) {
  const [competitors, setCompetitors] = useState<EbayCompetitorListingRow[]>(
    [],
  );
  const [ourSkus, setOurSkus] = useState<OurListingSkuOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingSkuKey, setSavingSkuKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [competitorName, setCompetitorName] = useState("");
  const [competitorItemId, setCompetitorItemId] = useState("");

  const ourPriceBySku = useMemo(() => {
    const map = new Map<string, OurListingSkuOption>();
    for (const option of ourSkus) {
      map.set(option.sku, option);
    }
    return map;
  }, [ourSkus]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/competitors`,
      );
      const payload = (await response.json()) as ListResponse;
      if (!payload.ok) {
        setError(payload.error);
        setCompetitors([]);
        setOurSkus([]);
        return;
      }
      setCompetitors(payload.competitors);
      setOurSkus(payload.ourSkus ?? []);
    } catch {
      setError("Failed to load competitor prices.");
      setCompetitors([]);
      setOurSkus([]);
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  function replaceCompetitor(next: EbayCompetitorListingRow) {
    setCompetitors((current) =>
      current.map((row) => (row.id === next.id ? next : row)),
    );
  }

  async function addCompetitor() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/competitors`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            competitorName,
            competitorItemId,
          }),
        },
      );
      const payload = (await response.json()) as MutateResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      setCompetitorName("");
      setCompetitorItemId("");
      setMessage(
        payload.competitor
          ? `Saved ${payload.competitor.variation_count} prices for ${payload.competitor.competitor_name}.`
          : "Competitor prices saved.",
      );
      await load();
    } catch {
      setError("Failed to pull competitor prices.");
    } finally {
      setSaving(false);
    }
  }

  async function refreshCompetitor(id: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/competitors/${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh" }),
        },
      );
      const payload = (await response.json()) as MutateResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      if (payload.competitor) {
        replaceCompetitor(payload.competitor);
      }
      setMessage(
        payload.competitor
          ? `Refreshed ${payload.competitor.variation_count} prices for ${payload.competitor.competitor_name}.`
          : "Competitor prices refreshed.",
      );
    } catch {
      setError("Failed to refresh competitor prices.");
    } finally {
      setBusyId(null);
    }
  }

  async function autoMatchCompetitor(id: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/competitors/${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "auto-match" }),
        },
      );
      const payload = (await response.json()) as MutateResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      if (payload.competitor) {
        replaceCompetitor(payload.competitor);
      }
      setMessage(payload.message || "Matched SKUs where variation options aligned.");
    } catch {
      setError("Failed to auto-match SKUs.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveOurSku(
    competitorId: string,
    specificsLabel: string,
    ourSku: string,
  ) {
    const key = `${competitorId}:${specificsLabel}`;
    setSavingSkuKey(key);
    setError(null);
    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/competitors/${encodeURIComponent(competitorId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            specificsLabel,
            ourSku: ourSku || null,
          }),
        },
      );
      const payload = (await response.json()) as MutateResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      if (payload.competitor) {
        replaceCompetitor(payload.competitor);
      }
    } catch {
      setError("Failed to save our SKU.");
    } finally {
      setSavingSkuKey(null);
    }
  }

  async function removeCompetitor(id: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/competitors/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as MutateResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      setMessage("Competitor removed.");
      await load();
    } catch {
      setError("Failed to remove competitor.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Add competitor</CardTitle>
          <CardDescription>
            Enter a competitor name and eBay item ID. Prices are pulled from the
            Browse API, then you map each variation to your SKU to compare
            prices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="competitor-name"
                className="text-sm font-medium text-muted-foreground"
              >
                Competitor name
              </label>
              <Input
                id="competitor-name"
                value={competitorName}
                onChange={(event) => setCompetitorName(event.target.value)}
                placeholder="e.g. Kayfast"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="competitor-item-id"
                className="text-sm font-medium text-muted-foreground"
              >
                Item ID
              </label>
              <Input
                id="competitor-item-id"
                value={competitorItemId}
                onChange={(event) => setCompetitorItemId(event.target.value)}
                placeholder="e.g. 365964722993"
                disabled={saving}
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void addCompetitor()}
            disabled={
              saving || !competitorName.trim() || !competitorItemId.trim()
            }
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Pulling prices…
              </>
            ) : (
              <>
                <Plus className="size-4" />
                Pull &amp; save prices
              </>
            )}
          </Button>
          {ourSkus.length === 0 && !loading ? (
            <p className="text-xs text-muted-foreground">
              No SKUs found on this listing yet. Add SKUs on the Variations tab
              so you can map and compare prices.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {message ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading saved competitors…
        </div>
      ) : competitors.length === 0 ? (
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>No competitors yet</CardTitle>
            <CardDescription>
              Add an item ID above to pull their variation prices into the
              database.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        competitors.map((competitor) => (
          <Card key={competitor.id} className="surface-card">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-base">
                    {competitor.competitor_name}
                  </CardTitle>
                  <CardDescription className="space-y-1">
                    <span className="block">
                      Item {competitor.competitor_item_id}
                      {competitor.competitor_title
                        ? ` · ${competitor.competitor_title}`
                        : ""}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {competitor.variation_count} variation
                        {competitor.variation_count === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline">
                        {competitor.prices.filter((row) => row.ourSku).length}{" "}
                        linked to our SKU
                      </Badge>
                      {competitor.fetched_at ? (
                        <span>
                          Fetched{" "}
                          {new Date(competitor.fetched_at).toLocaleString(
                            "en-GB",
                          )}
                        </span>
                      ) : null}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {competitor.competitor_url ? (
                    <a
                      href={competitor.competitor_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button type="button" size="sm" variant="outline">
                        Open on eBay
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === competitor.id || ourSkus.length === 0}
                    onClick={() => void autoMatchCompetitor(competitor.id)}
                  >
                    {busyId === competitor.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Link2 className="size-4" />
                    )}
                    Auto-match SKUs
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === competitor.id}
                    onClick={() => void refreshCompetitor(competitor.id)}
                  >
                    {busyId === competitor.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === competitor.id}
                    onClick={() => void removeCompetitor(competitor.id)}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Variation</TableHead>
                      <TableHead>Their SKU</TableHead>
                      <TableHead className="min-w-[14rem]">Our SKU</TableHead>
                      <TableHead className="text-right">Their price</TableHead>
                      <TableHead className="text-right">Our price</TableHead>
                      <TableHead className="pr-6 text-right">Diff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitor.prices.map((row, index) => {
                      const our = row.ourSku
                        ? ourPriceBySku.get(row.ourSku)
                        : undefined;
                      const diff = priceDiff(our?.price, row.price);
                      const skuKey = `${competitor.id}:${row.specificsLabel}`;
                      return (
                        <TableRow
                          key={`${competitor.id}-${row.specificsLabel}-${index}`}
                        >
                          <TableCell className="max-w-[22rem] whitespace-normal pl-6 align-top">
                            {row.specificsLabel}
                          </TableCell>
                          <TableCell className="align-top font-mono text-xs">
                            {row.sku || "—"}
                          </TableCell>
                          <TableCell className="align-top">
                            <select
                              className="h-8 w-full min-w-[12rem] rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                              value={row.ourSku ?? ""}
                              disabled={
                                ourSkus.length === 0 || savingSkuKey === skuKey
                              }
                              onChange={(event) =>
                                void saveOurSku(
                                  competitor.id,
                                  row.specificsLabel,
                                  event.target.value,
                                )
                              }
                            >
                              <option value="">Not linked</option>
                              {ourSkus.map((option) => (
                                <option key={option.sku} value={option.sku}>
                                  {option.sku}
                                  {option.specifics
                                    ? ` — ${option.specifics}`
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell className="text-right align-top tabular-nums">
                            {row.price != null
                              ? formatMoney(row.price, row.currency || "GBP")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right align-top tabular-nums">
                            {our?.price != null
                              ? formatMoney(our.price, our.currency || "GBP")
                              : "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "pr-6 text-right align-top tabular-nums",
                              diff == null
                                ? "text-muted-foreground"
                                : diff > 0
                                  ? "text-amber-700 dark:text-amber-300"
                                  : diff < 0
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "",
                            )}
                          >
                            {diff == null
                              ? "—"
                              : `${diff > 0 ? "+" : ""}${formatMoney(diff, row.currency || our?.currency || "GBP")}`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
