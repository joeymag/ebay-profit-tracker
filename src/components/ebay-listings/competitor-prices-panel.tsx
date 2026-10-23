"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
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
import type { EbayCompetitorListingRow } from "@/lib/ebay/competitor-prices";
import { formatMoney } from "@/lib/format";

type ListResponse =
  | { ok: true; competitors: EbayCompetitorListingRow[] }
  | { ok: false; error: string };

type MutateResponse =
  | { ok: true; competitor?: EbayCompetitorListingRow }
  | { ok: false; error: string; details?: string };

type CompetitorPricesPanelProps = {
  listingId: string;
};

export function CompetitorPricesPanel({ listingId }: CompetitorPricesPanelProps) {
  const [competitors, setCompetitors] = useState<EbayCompetitorListingRow[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [competitorName, setCompetitorName] = useState("");
  const [competitorItemId, setCompetitorItemId] = useState("");

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
        return;
      }
      setCompetitors(payload.competitors);
    } catch {
      setError("Failed to load competitor prices.");
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        { method: "POST" },
      );
      const payload = (await response.json()) as MutateResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      setMessage(
        payload.competitor
          ? `Refreshed ${payload.competitor.variation_count} prices for ${payload.competitor.competitor_name}.`
          : "Competitor prices refreshed.",
      );
      await load();
    } catch {
      setError("Failed to refresh competitor prices.");
    } finally {
      setBusyId(null);
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
            Browse API and saved against this listing.
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
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Variation</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="pr-6 text-right">Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitor.prices.map((row, index) => (
                      <TableRow
                        key={`${competitor.id}-${row.specificsLabel}-${index}`}
                      >
                        <TableCell className="max-w-[28rem] whitespace-normal pl-6 align-top">
                          {row.specificsLabel}
                        </TableCell>
                        <TableCell className="align-top font-mono text-xs">
                          {row.sku || "—"}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          {row.price != null
                            ? formatMoney(row.price, row.currency || "GBP")
                            : "—"}
                        </TableCell>
                        <TableCell className="pr-6 text-right align-top tabular-nums">
                          {row.quantityAvailable != null
                            ? row.quantityAvailable.toLocaleString("en-GB")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
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
