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

const PREFERRED_AXIS_ORDER = [
  "screw size",
  "size",
  "gauge",
  "your pack quantity",
  "pack quantity",
  "pack size",
  "quantity",
  "number in pack",
];

function shortAxisLabel(name: string): string {
  const lower = name.trim().toLowerCase();
  if (lower.includes("screw size") || lower === "size") return "Size";
  if (lower.includes("pack")) return "Pack";
  if (lower.includes("gauge")) return "Gauge";
  if (lower.includes("quantity") || lower.includes("qty")) return "Qty";
  return name;
}

function shortAspectValue(value: string): string {
  // "3mm x 10mm (No.4 x 3/8\")" → keep readable but drop trailing noise if huge
  const trimmed = value.trim();
  if (trimmed.length <= 40) return trimmed;
  return `${trimmed.slice(0, 37)}…`;
}

function axisNamesFromCompetitor(
  competitor: EbayCompetitorListingRow,
): string[] {
  const counts = new Map<string, Set<string>>();
  for (const row of competitor.prices) {
    for (const pair of row.specificsPairs) {
      const set = counts.get(pair.name) ?? new Set<string>();
      set.add(pair.value);
      counts.set(pair.name, set);
    }
  }

  const varying = [...counts.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([name]) => name);

  const names = varying.length > 0 ? varying : [...counts.keys()];
  return names.sort((a, b) => {
    const ai = PREFERRED_AXIS_ORDER.findIndex((key) =>
      a.toLowerCase().includes(key),
    );
    const bi = PREFERRED_AXIS_ORDER.findIndex((key) =>
      b.toLowerCase().includes(key),
    );
    const aRank = ai === -1 ? 99 : ai;
    const bRank = bi === -1 ? 99 : bi;
    return aRank - bRank || a.localeCompare(b);
  });
}

function aspectValue(
  row: EbayCompetitorListingRow["prices"][number],
  axisName: string,
): string {
  return (
    row.specificsPairs.find((pair) => pair.name === axisName)?.value?.trim() ||
    "—"
  );
}

function sortCompetitorRows(
  rows: EbayCompetitorListingRow["prices"],
  axes: string[],
) {
  return [...rows].sort((a, b) => {
    for (const axis of axes) {
      const av = aspectValue(a, axis);
      const bv = aspectValue(b, axis);
      const an = Number.parseFloat(av.replace(/,/g, ""));
      const bn = Number.parseFloat(bv.replace(/,/g, ""));
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
        return an - bn;
      }
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      if (cmp) return cmp;
    }
    return a.specificsLabel.localeCompare(b.specificsLabel, undefined, {
      numeric: true,
    });
  });
}

function CompetitorPricesTable({
  competitor,
  ourSkus,
  ourPriceBySku,
  savingSkuKey,
  onSaveOurSku,
}: {
  competitor: EbayCompetitorListingRow;
  ourSkus: OurListingSkuOption[];
  ourPriceBySku: Map<string, OurListingSkuOption>;
  savingSkuKey: string | null;
  onSaveOurSku: (
    competitorId: string,
    specificsLabel: string,
    ourSku: string,
  ) => Promise<void>;
}) {
  const axes = useMemo(
    () => axisNamesFromCompetitor(competitor).slice(0, 3),
    [competitor],
  );
  const rows = useMemo(
    () => sortCompetitorRows(competitor.prices, axes),
    [competitor.prices, axes],
  );
  const showTheirSku = rows.some((row) => Boolean(row.sku?.trim()));

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[720px] text-sm">
        <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
          <TableRow className="hover:bg-transparent">
            {axes.map((axis) => (
              <TableHead
                key={axis}
                className="whitespace-nowrap px-3 first:pl-5"
              >
                {shortAxisLabel(axis)}
              </TableHead>
            ))}
            {axes.length === 0 ? (
              <TableHead className="pl-5">Variation</TableHead>
            ) : null}
            <TableHead className="w-[7.5rem] whitespace-nowrap px-3 text-right">
              Their £
            </TableHead>
            <TableHead className="w-[7.5rem] whitespace-nowrap px-3 text-right">
              Our £
            </TableHead>
            <TableHead className="w-[6.5rem] whitespace-nowrap px-3 text-right">
              Diff
            </TableHead>
            <TableHead className="min-w-[9.5rem] px-3">Our SKU</TableHead>
            {showTheirSku ? (
              <TableHead className="px-3 pr-5 text-muted-foreground">
                Their SKU
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const our = row.ourSku
              ? ourPriceBySku.get(row.ourSku)
              : undefined;
            const diff = priceDiff(our?.price, row.price);
            const skuKey = `${competitor.id}:${row.specificsLabel}`;
            const undercut = diff != null && diff > 0;
            const weCheaper = diff != null && diff < 0;
            const prev = rows[index - 1];
            const sizeAxis = axes[0];
            const newSizeGroup =
              sizeAxis &&
              prev &&
              aspectValue(prev, sizeAxis) !== aspectValue(row, sizeAxis);

            return (
              <TableRow
                key={`${competitor.id}-${row.specificsLabel}-${index}`}
                className={cn(
                  undercut && "bg-amber-500/10",
                  weCheaper && "bg-emerald-500/5",
                  newSizeGroup && "border-t-2 border-border",
                )}
              >
                {axes.map((axis) => (
                  <TableCell
                    key={axis}
                    className="whitespace-nowrap px-3 align-middle first:pl-5"
                    title={aspectValue(row, axis)}
                  >
                    <span className="font-medium">
                      {shortAspectValue(aspectValue(row, axis))}
                    </span>
                  </TableCell>
                ))}
                {axes.length === 0 ? (
                  <TableCell className="max-w-[16rem] whitespace-normal pl-5 align-middle text-xs">
                    {row.specificsLabel}
                  </TableCell>
                ) : null}
                <TableCell className="px-3 text-right align-middle tabular-nums font-medium">
                  {row.price != null
                    ? formatMoney(row.price, row.currency || "GBP")
                    : "—"}
                </TableCell>
                <TableCell className="px-3 text-right align-middle tabular-nums">
                  {our?.price != null
                    ? formatMoney(our.price, our.currency || "GBP")
                    : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "px-3 text-right align-middle tabular-nums font-medium",
                    diff == null
                      ? "text-muted-foreground"
                      : undercut
                        ? "text-amber-700 dark:text-amber-300"
                        : weCheaper
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "",
                  )}
                >
                  {diff == null
                    ? "—"
                    : `${diff > 0 ? "+" : ""}${formatMoney(
                        diff,
                        row.currency || our?.currency || "GBP",
                      )}`}
                </TableCell>
                <TableCell className="px-3 align-middle">
                  <select
                    className="h-8 w-full max-w-[11rem] rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                    value={row.ourSku ?? ""}
                    title={
                      row.ourSku
                        ? ourPriceBySku.get(row.ourSku)?.specifics || row.ourSku
                        : "Link to your SKU"
                    }
                    disabled={
                      ourSkus.length === 0 || savingSkuKey === skuKey
                    }
                    onChange={(event) =>
                      void onSaveOurSku(
                        competitor.id,
                        row.specificsLabel,
                        event.target.value,
                      )
                    }
                  >
                    <option value="">Not linked</option>
                    {ourSkus.map((option) => (
                      <option
                        key={option.sku}
                        value={option.sku}
                        title={option.specifics}
                      >
                        {option.sku}
                      </option>
                    ))}
                  </select>
                </TableCell>
                {showTheirSku ? (
                  <TableCell className="px-3 pr-5 align-middle font-mono text-xs text-muted-foreground">
                    {row.sku || "—"}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
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
                    <span className="block truncate" title={competitor.competitor_title ?? undefined}>
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
              <CompetitorPricesTable
                competitor={competitor}
                ourSkus={ourSkus}
                ourPriceBySku={ourPriceBySku}
                savingSkuKey={savingSkuKey}
                onSaveOurSku={saveOurSku}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
