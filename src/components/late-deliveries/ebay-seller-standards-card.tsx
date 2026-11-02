"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatOrderDate } from "@/lib/format";

type StandardsMetric = {
  key: string;
  label: string;
  value: string | null;
  numericValue: number | null;
  rating: string | null;
  peerAverage: string | null;
};

type StandardsProfile = {
  program: string;
  cycleType: string | null;
  evaluationDate: string | null;
  evaluationMonth: string | null;
  standardsLevel: string;
  evaluationReason: string | null;
  metrics: StandardsMetric[];
};

type CustomerServiceMetric = {
  type: string;
  label: string;
  evaluationType: string;
  marketplaceId: string | null;
  cycleStart: string | null;
  cycleEnd: string | null;
  transactionCount: number | null;
  defectCount: number | null;
  rate: number | null;
  rating: string | null;
  peerAverage: string | null;
};

type Snapshot = {
  marketplaceId: string;
  profiles: StandardsProfile[];
  primaryProfile: StandardsProfile | null;
  customerService: CustomerServiceMetric[];
  fetchedAt: string;
};

type SnapshotResponse =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; error: string; code?: string };

function levelLabel(level: string): string {
  switch (level) {
    case "TOP_RATED":
      return "Top Rated";
    case "ABOVE_STANDARD":
      return "Above Standard";
    case "BELOW_STANDARD":
      return "Below Standard";
    default:
      return level.replaceAll("_", " ");
  }
}

function levelClass(level: string): string {
  switch (level) {
    case "TOP_RATED":
      return "text-emerald-700 dark:text-emerald-400";
    case "ABOVE_STANDARD":
      return "text-sky-700 dark:text-sky-400";
    case "BELOW_STANDARD":
      return "text-destructive";
    default:
      return "text-foreground";
  }
}

function formatRate(value: number | null): string {
  if (value == null) return "—";
  // eBay rates are usually fractions (0.012 = 1.2%) or already percent-like.
  if (value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(2)}%`;
  }
  return `${value.toFixed(2)}%`;
}

function formatCount(value: number | null): string {
  if (value == null) return "—";
  return String(value);
}

export function EbaySellerStandardsCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ebay/analytics/seller-standards");
      const payload = (await response.json()) as SnapshotResponse;
      if (!payload.ok) {
        setSnapshot(null);
        setError(payload.error);
        return;
      }
      setSnapshot(payload.snapshot);
    } catch {
      setSnapshot(null);
      setError("Could not load eBay seller standards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profile = snapshot?.primaryProfile ?? null;
  const currentCs =
    snapshot?.customerService.filter((row) => row.evaluationType === "CURRENT") ??
    [];
  const projectedCs =
    snapshot?.customerService.filter(
      (row) => row.evaluationType === "PROJECTED",
    ) ?? [];

  const highlightKeys = new Set([
    "TRANSACTION_DEFECT_RATE",
    "LATE_SHIPMENT_RATE",
    "CASES_CLOSED_WITHOUT_SELLER_RESOLUTION",
    "CLAIMS_SAF_RATE",
    "SHIPPING_MISS_RATE",
  ]);

  const highlightMetrics =
    profile?.metrics.filter((metric) => highlightKeys.has(metric.key)) ??
    profile?.metrics.slice(0, 6) ??
    [];

  return (
    <Card className="surface-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5" />
            eBay seller standards
          </CardTitle>
          <CardDescription>
            Official Defects and late shipment metrics from the eBay Analytics
            API (Seller Standards + customer service metrics).
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </>
          ) : (
            <>
              <RefreshCw className="size-4" />
              Refresh
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading && !snapshot ? (
          <p className="text-sm text-muted-foreground">
            Pulling seller standards from eBay…
          </p>
        ) : null}

        {profile ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  {profile.program}
                  {profile.cycleType ? ` · ${profile.cycleType}` : ""}
                  {profile.evaluationMonth
                    ? ` · ${profile.evaluationMonth}`
                    : ""}
                </p>
                <p
                  className={`text-2xl font-semibold ${levelClass(profile.standardsLevel)}`}
                >
                  {levelLabel(profile.standardsLevel)}
                </p>
              </div>
              {snapshot?.fetchedAt ? (
                <p className="text-xs text-muted-foreground">
                  Updated {formatOrderDate(snapshot.fetchedAt)}
                </p>
              ) : null}
            </div>

            {profile.evaluationReason ? (
              <p className="text-sm text-muted-foreground">
                {profile.evaluationReason}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {highlightMetrics.map((metric) => (
                <div
                  key={metric.key}
                  className="rounded-lg border border-border/70 bg-muted/20 p-3"
                >
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {metric.numericValue != null &&
                    metric.key.includes("RATE")
                      ? formatRate(metric.numericValue)
                      : (metric.value ?? "—")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metric.rating ? `Rating: ${metric.rating}` : null}
                    {metric.peerAverage
                      ? `${metric.rating ? " · " : ""}Peer avg: ${metric.peerAverage}`
                      : null}
                    {!metric.rating && !metric.peerAverage ? "—" : null}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && !error && !profile ? (
          <p className="text-sm text-muted-foreground">
            No seller standards profile returned for this account yet.
          </p>
        ) : null}

        {currentCs.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Defects (current evaluation)</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1.5 font-medium">Type</th>
                    <th className="pb-1.5 text-right font-medium">Defects</th>
                    <th className="pb-1.5 text-right font-medium">Transactions</th>
                    <th className="pb-1.5 text-right font-medium">Rate</th>
                    <th className="pb-1.5 text-right font-medium">Rating</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {currentCs.map((row) => (
                    <tr key={`${row.type}-${row.evaluationType}`}>
                      <td className="py-1.5 text-muted-foreground">
                        {row.label}
                      </td>
                      <td className="py-1.5 text-right font-medium">
                        {formatCount(row.defectCount)}
                      </td>
                      <td className="py-1.5 text-right">
                        {formatCount(row.transactionCount)}
                      </td>
                      <td className="py-1.5 text-right font-medium">
                        {formatRate(row.rate)}
                      </td>
                      <td className="py-1.5 text-right">
                        {row.rating ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {projectedCs.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Projected (next evaluation)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {projectedCs.map((row) => (
                <div
                  key={`${row.type}-${row.evaluationType}`}
                  className="rounded-lg border border-border/70 bg-muted/10 p-3 text-sm"
                >
                  <p className="text-muted-foreground">{row.label}</p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {formatRate(row.rate)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {formatCount(row.defectCount)} /{" "}
                      {formatCount(row.transactionCount)}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
