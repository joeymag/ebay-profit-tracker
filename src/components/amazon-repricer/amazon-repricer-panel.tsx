"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

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
import type { AmazonListing } from "@/lib/amazon/listings";
import type {
  AmazonRepriceEvent,
  AmazonRepriceRule,
  RepriceStrategy,
} from "@/lib/amazon/repricer";
import type { AmazonCompetitiveSnapshot } from "@/lib/amazon/pricing";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";

type RepricerRow = AmazonListing & {
  rule: AmazonRepriceRule | null;
  competitive: AmazonCompetitiveSnapshot | null;
  suggestedPrice: number | null;
  reason: string;
};

type RepricerResponse =
  | { ok: true; count: number; rows: RepricerRow[] }
  | { ok: false; error: string; code?: string; details?: string };

type HistoryResponse =
  | { ok: true; days: number; count: number; events: AmazonRepriceEvent[] }
  | { ok: false; error: string };

const STRATEGIES: Array<{ value: RepriceStrategy; label: string }> = [
  { value: "undercut_buybox", label: "Beat Buy Box by £0.01" },
  { value: "undercut_lowest", label: "Undercut lowest" },
  { value: "match_lowest", label: "Match lowest" },
  { value: "match_buybox", label: "Match Buy Box" },
  { value: "manual", label: "Manual only" },
];

type BuyBoxFilter = "all" | "in" | "out" | "unknown";
type ChangedFilter = "all" | "changed" | "unchanged";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type DraftRule = {
  enabled: boolean;
  strategy: RepriceStrategy;
  minPrice: string;
  maxPrice: string;
  undercutAmount: string;
};

function draftFromRule(rule: AmazonRepriceRule | null): DraftRule {
  return {
    enabled: rule?.enabled ?? true,
    strategy: rule?.strategy ?? "undercut_buybox",
    minPrice: rule?.minPrice != null ? String(rule.minPrice) : "",
    maxPrice: rule?.maxPrice != null ? String(rule.maxPrice) : "",
    undercutAmount:
      rule?.undercutAmount != null ? String(rule.undercutAmount) : "0.01",
  };
}

type CompetitiveBatchResponse =
  | {
      ok: true;
      suggestions: Array<{
        sku: string;
        competitive: AmazonCompetitiveSnapshot | null;
        suggestedPrice: number | null;
        reason: string;
        rule: AmazonRepriceRule | null;
      }>;
    }
  | { ok: false; error: string };

export function AmazonRepricerPanel() {
  const [rows, setRows] = useState<RepricerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [buyBoxFilter, setBuyBoxFilter] = useState<BuyBoxFilter>("all");
  const [changedFilter, setChangedFilter] = useState<ChangedFilter>("all");
  const [history, setHistory] = useState<AmazonRepriceEvent[]>([]);
  const [historyDays] = useState(7);
  const [drafts, setDrafts] = useState<Record<string, DraftRule>>({});
  const [busySku, setBusySku] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/amazon/repricer/history?days=${historyDays}&limit=150`,
      );
      const json = (await res.json()) as HistoryResponse;
      if (json.ok) setHistory(json.events);
    } catch {
      // Non-blocking — listings still work without history.
    }
  }, [historyDays]);

  const lastChangeBySku = useMemo(() => {
    const map = new Map<string, AmazonRepriceEvent>();
    for (const event of history) {
      if (!map.has(event.sku)) map.set(event.sku, event);
    }
    return map;
  }, [history]);

  const enrichCompetitive = useCallback(async (listings: RepricerRow[]) => {
    const skus = listings.map((row) => row.sku).filter(Boolean);
    if (skus.length === 0) return;

    setEnriching(true);
    setEnrichProgress({ done: 0, total: skus.length });
    const chunkSize = 5;
    const priceBySku = Object.fromEntries(
      listings.map((row) => [row.sku, row.price]),
    );

    try {
      for (let i = 0; i < skus.length; i += chunkSize) {
        const chunk = skus.slice(i, i + chunkSize);
        const res = await fetch("/api/amazon/repricer/competitive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skus: chunk, prices: priceBySku }),
        });
        let json: CompetitiveBatchResponse;
        try {
          json = (await res.json()) as CompetitiveBatchResponse;
        } catch {
          setEnrichProgress({ done: i + chunk.length, total: skus.length });
          continue;
        }
        if (!json.ok) {
          setEnrichProgress({ done: i + chunk.length, total: skus.length });
          continue;
        }

        const bySku = new Map(json.suggestions.map((s) => [s.sku, s]));
        setRows((prev) =>
          prev.map((row) => {
            const suggestion = bySku.get(row.sku);
            if (!suggestion) return row;
            return {
              ...row,
              competitive: suggestion.competitive,
              suggestedPrice: suggestion.suggestedPrice,
              reason: suggestion.reason,
              rule: suggestion.rule ?? row.rule,
            };
          }),
        );
        setEnrichProgress({ done: i + chunk.length, total: skus.length });
      }
    } finally {
      setEnriching(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setMessage(null);
    setEnriching(false);
    setEnrichProgress({ done: 0, total: 0 });
    try {
      const res = await fetch("/api/amazon/repricer");
      let json: RepricerResponse;
      try {
        json = (await res.json()) as RepricerResponse;
      } catch {
        setRows([]);
        setError(
          res.ok
            ? "Amazon repricer returned an invalid response."
            : `Amazon repricer failed (HTTP ${res.status}). Try again.`,
        );
        return;
      }
      if (!json.ok) {
        setRows([]);
        setError(json.error);
        setErrorCode(json.code);
        return;
      }
      setRows(json.rows);
      setDrafts(
        Object.fromEntries(
          json.rows.map((row) => [row.sku, draftFromRule(row.rule)]),
        ),
      );
      setLoading(false);
      void enrichCompetitive(json.rows);
      void loadHistory();
      return;
    } catch {
      setRows([]);
      setError("Could not reach the Amazon repricer API.");
    } finally {
      setLoading(false);
    }
  }, [enrichCompetitive, loadHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const haystack = [row.title, row.sku, row.asin]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      const youHaveBuyBox = row.competitive?.youHaveBuyBox;
      if (buyBoxFilter === "in" && youHaveBuyBox !== true) return false;
      if (buyBoxFilter === "out" && youHaveBuyBox !== false) return false;
      if (buyBoxFilter === "unknown") {
        if (!(row.competitive == null || youHaveBuyBox == null)) return false;
      }

      const changedRecently = lastChangeBySku.has(row.sku);
      if (changedFilter === "changed" && !changedRecently) return false;
      if (changedFilter === "unchanged" && changedRecently) return false;

      return true;
    });
  }, [rows, search, buyBoxFilter, changedFilter, lastChangeBySku]);

  function updateDraft(sku: string, patch: Partial<DraftRule>) {
    setDrafts((prev) => ({
      ...prev,
      [sku]: { ...(prev[sku] ?? draftFromRule(null)), ...patch },
    }));
  }

  async function saveRule(sku: string) {
    const draft = drafts[sku] ?? draftFromRule(null);
    setBusySku(sku);
    setMessage(null);
    try {
      const res = await fetch("/api/amazon/repricer/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          enabled: draft.enabled,
          strategy: draft.strategy,
          minPrice: draft.minPrice === "" ? null : Number(draft.minPrice),
          maxPrice: draft.maxPrice === "" ? null : Number(draft.maxPrice),
          undercutAmount:
            draft.undercutAmount === "" ? 0.01 : Number(draft.undercutAmount),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setMessage(json.error || "Failed to save rule.");
        return;
      }
      setMessage(`Saved rule for ${sku}. Refresh to recalculate suggestions.`);
    } finally {
      setBusySku(null);
    }
  }

  async function applyPrice(sku: string, price: number) {
    setBusySku(sku);
    setMessage(null);
    const current = rows.find((row) => row.sku === sku);
    try {
      const res = await fetch("/api/amazon/repricer/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          price,
          fromPrice: current?.price ?? null,
          reason: current?.reason || "Manual apply from Amazon repricer",
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        price?: number;
        status?: string;
      };
      if (!json.ok) {
        setMessage(json.error || "Failed to apply price.");
        return;
      }
      setMessage(
        `Updated ${sku} to ${formatMoney(json.price ?? price)} (${json.status || "OK"}).`,
      );
      setRows((prev) =>
        prev.map((row) =>
          row.sku === sku
            ? { ...row, price: json.price ?? price, suggestedPrice: null }
            : row,
        ),
      );
      void loadHistory();
    } finally {
      setBusySku(null);
    }
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Amazon listings…
      </div>
    );
  }

  if (error && rows.length === 0) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not load Amazon repricer</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void load()}>
              Retry
            </Button>
            {errorCode === "NOT_CONNECTED" ? (
              <Link
                href="/settings"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Open Settings
              </Link>
            ) : null}
            {errorCode === "CACHE_EMPTY" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void (async () => {
                      setMessage("Starting listings cache build…");
                      try {
                        const res = await fetch("/api/amazon/listings/warm", {
                          method: "POST",
                        });
                        const json = (await res.json()) as {
                          ok?: boolean;
                          status?: string;
                          message?: string;
                          error?: string;
                        };
                        if (!res.ok || json.ok === false) {
                          setMessage(
                            json.error || "Could not start listings cache build.",
                          );
                          return;
                        }
                        if (json.status === "ready") {
                          setMessage("Cache ready — click Retry.");
                          return;
                        }
                        setMessage(
                          "Building listings cache… wait about 1–2 minutes, then click Retry.",
                        );
                      } catch {
                        setMessage("Could not start listings cache build.");
                      }
                    })();
                  }}
                >
                  Build listings cache
                </Button>
                <Link
                  href="/amazon-listings"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Open Amazon listings
                </Link>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set min and max for each SKU, then use Beat Buy Box by £0.01 to win the
        Buy Box within your floor/ceiling. Auto-reprice runs every 15–30 minutes
        for enabled rules with a min price (manual is skipped). Point cron-job.org
        at <code className="text-xs">/api/cron/amazon-reprice</code> with{" "}
        <code className="text-xs">Authorization: Bearer CRON_SECRET</code>.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{filtered.length} listings</Badge>
          {enriching ? (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              Buy Box {Math.min(enrichProgress.done, enrichProgress.total)}/
              {enrichProgress.total}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search title, SKU, ASIN…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={buyBoxFilter}
            onChange={(event) =>
              setBuyBoxFilter(event.target.value as BuyBoxFilter)
            }
            aria-label="Filter by Buy Box"
          >
            <option value="all">All Buy Box</option>
            <option value="in">In Buy Box</option>
            <option value="out">Not in Buy Box</option>
            <option value="unknown">Buy Box unknown</option>
          </select>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={changedFilter}
            onChange={(event) =>
              setChangedFilter(event.target.value as ChangedFilter)
            }
            aria-label="Filter by recent price changes"
          >
            <option value="all">All prices</option>
            <option value="changed">Changed last {historyDays} days</option>
            <option value="unchanged">Not changed last {historyDays} days</option>
          </select>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || enriching}
            onClick={() => void load()}
          >
            {loading || enriching ? (
              <>
                <Loader2 className="animate-spin" />
                {loading ? "Refreshing…" : "Loading Buy Box…"}
              </>
            ) : (
              <>
                <RefreshCw />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">{message}</div>
      ) : null}

      <Card className="surface-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Price changes (last {historyDays} days)
          </CardTitle>
          <CardDescription>
            Logged when you Apply manually or when cron auto-reprices. Older
            changes before this feature won&apos;t appear.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No price changes logged yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">From</TableHead>
                    <TableHead className="text-right">To</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.slice(0, 40).map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatWhen(event.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs break-all">
                        {event.sku}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {event.fromPrice != null
                          ? formatMoney(event.fromPrice)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoney(event.toPrice)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {event.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                        {event.reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Image</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Yours</TableHead>
              <TableHead className="text-right">Buy Box</TableHead>
              <TableHead className="text-right">Lowest</TableHead>
              <TableHead>Last change</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Min / Max</TableHead>
              <TableHead className="text-right">Suggested</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const draft = drafts[row.sku] ?? draftFromRule(row.rule);
              const busy = busySku === row.sku;
              return (
                <TableRow key={row.sku}>
                  <TableCell>
                    <LineItemImage
                      src={row.imageUrl}
                      alt={row.title}
                      className="size-10 rounded-md object-cover"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[260px] max-w-[420px] space-y-1.5">
                      <p className="text-sm font-medium leading-snug whitespace-normal break-words">
                        {row.title}
                      </p>
                      {row.asin ? (
                        <p className="text-xs text-muted-foreground">
                          ASIN:{" "}
                          <span className="font-mono text-foreground">
                            {row.asin}
                          </span>
                        </p>
                      ) : null}
                      {row.competitive?.youHaveBuyBox ? (
                        <Badge className="bg-green-600">Buy Box</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.sku ? (
                      <span className="font-mono text-xs break-all">
                        {row.sku}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.price != null ? formatMoney(row.price) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.competitive?.buyBoxPrice != null
                      ? formatMoney(row.competitive.buyBoxPrice)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.competitive?.lowestPrice != null
                      ? formatMoney(row.competitive.lowestPrice)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const last = lastChangeBySku.get(row.sku);
                      if (!last) {
                        return (
                          <span className="text-xs text-muted-foreground">—</span>
                        );
                      }
                      return (
                        <div className="space-y-0.5 text-xs">
                          <p className="tabular-nums font-medium">
                            {last.fromPrice != null
                              ? `${formatMoney(last.fromPrice)} → `
                              : ""}
                            {formatMoney(last.toPrice)}
                          </p>
                          <p className="text-muted-foreground">
                            {formatWhen(last.createdAt)} · {last.source}
                          </p>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      value={draft.strategy}
                      onChange={(event) =>
                        updateDraft(row.sku, {
                          strategy: event.target.value as RepriceStrategy,
                        })
                      }
                    >
                      {STRATEGIES.map((strategy) => (
                        <option key={strategy.value} value={strategy.value}>
                          {strategy.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-8 w-20 text-xs"
                        inputMode="decimal"
                        placeholder="Min"
                        value={draft.minPrice}
                        onChange={(event) =>
                          updateDraft(row.sku, { minPrice: event.target.value })
                        }
                      />
                      <Input
                        className="h-8 w-20 text-xs"
                        inputMode="decimal"
                        placeholder="Max"
                        value={draft.maxPrice}
                        onChange={(event) =>
                          updateDraft(row.sku, { maxPrice: event.target.value })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="space-y-1">
                      <p className="tabular-nums font-medium">
                        {row.suggestedPrice != null
                          ? formatMoney(row.suggestedPrice)
                          : "—"}
                      </p>
                      <p className="max-w-[140px] text-[10px] leading-snug text-muted-foreground">
                        {row.reason}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void saveRule(row.sku)}
                      >
                        Save rule
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || row.suggestedPrice == null}
                        onClick={() =>
                          row.suggestedPrice != null
                            ? void applyPrice(row.sku, row.suggestedPrice)
                            : undefined
                        }
                      >
                        {busy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
