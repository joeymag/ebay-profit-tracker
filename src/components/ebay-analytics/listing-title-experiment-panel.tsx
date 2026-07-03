"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

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
import type { ListingTitleExperiment } from "@/lib/ebay/listing-title-experiment";
import {
  ebayListingUrl,
  formatPercent,
} from "@/lib/ebay/traffic-report-types";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type ExperimentResponse =
  | { ok: true; experiment: ListingTitleExperiment }
  | { ok: false; error: string; details?: string };

function formatCount(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-GB");
}

function formatDelta(value: number | null | undefined, suffix = ""): string {
  if (value == null) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-GB")}${suffix}`;
}

function formatDateRange(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (!endedAt) {
    return `${start} → now`;
  }

  const end = new Date(endedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${start} → ${end}`;
}

export function ListingTitleExperimentPanel({
  listingId,
}: {
  listingId: string;
}) {
  const [experiment, setExperiment] = useState<ListingTitleExperiment | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadExperiment = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}`,
      );
      const data = (await response.json()) as ExperimentResponse;

      if (!data.ok) {
        setExperiment(null);
        setError(data.error);
        return;
      }

      setExperiment(data.experiment);
      setTitle(
        data.experiment.currentListing.title ??
          data.experiment.periods.at(-1)?.title ??
          "",
      );
    } catch {
      setExperiment(null);
      setError("Could not load listing title experiment.");
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void loadExperiment();
  }, [loadExperiment]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/title`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            notes,
            sku: experiment?.currentListing.sku,
            imageUrl: experiment?.currentListing.imageUrl,
            applyToEbay: true,
          }),
        },
      );

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        ebayUpdateError?: string | null;
      };

      if (!data.ok) {
        setSaveMessage(data.error ?? "Could not save title.");
        return;
      }

      setNotes("");
      if (data.ebayUpdateError) {
        setSaveMessage(
          `Title saved for tracking. eBay update note: ${data.ebayUpdateError}`,
        );
      } else {
        setSaveMessage("Title saved and tracking started from today.");
      }

      await loadExperiment();
    } catch {
      setSaveMessage("Could not save title.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading title history and performance…
      </div>
    );
  }

  if (error || !experiment) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not load listing</CardTitle>
          <CardDescription>{error ?? "Unknown error"}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/ebay-analytics" className={cn(buttonVariants())}>
            Back to eBay analytics
          </Link>
        </CardContent>
      </Card>
    );
  }

  const activePeriod = experiment.periods.find((period) => !period.endedAt);
  const latestComparison = experiment.comparisons.at(-1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/ebay-analytics"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}
        >
          <ArrowLeft className="size-4" />
          Back to analytics
        </Link>
        <a
          href={
            experiment.currentListing.itemWebUrl ??
            ebayListingUrl(experiment.listingId, experiment.marketplaceId)
          }
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
        >
          View on eBay
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <Card className="surface-card">
        <CardHeader>
          <div className="flex flex-wrap items-start gap-4">
            <LineItemImage
              src={experiment.currentListing.imageUrl}
              alt={experiment.currentListing.title ?? experiment.listingId}
              className="size-20"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <CardTitle className="text-xl leading-snug">
                {experiment.currentListing.title ?? `Listing ${experiment.listingId}`}
              </CardTitle>
              <CardDescription className="space-y-1">
                <span className="block font-mono text-xs">{experiment.listingId}</span>
                {experiment.currentListing.sku ? (
                  <span className="block">SKU {experiment.currentListing.sku}</span>
                ) : null}
                {experiment.currentListing.price != null ? (
                  <span className="block">
                    {formatMoney(
                      experiment.currentListing.price,
                      experiment.currentListing.currency ?? "GBP",
                    )}
                  </span>
                ) : null}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {latestComparison ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="surface-card">
            <CardHeader className="pb-2">
              <CardDescription>Sales change</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {formatDelta(latestComparison.salesDelta)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Since the latest title change
            </CardContent>
          </Card>
          <Card className="surface-card">
            <CardHeader className="pb-2">
              <CardDescription>Views change</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {formatDelta(latestComparison.viewsDelta)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="surface-card">
            <CardHeader className="pb-2">
              <CardDescription>Search impressions change</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {formatDelta(latestComparison.impressionsDelta)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="surface-card">
            <CardHeader className="pb-2">
              <CardDescription>CTR change</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {latestComparison.ctrDelta != null
                  ? formatDelta(Number((latestComparison.ctrDelta * 100).toFixed(1)), " pp")
                  : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Edit listing title</CardTitle>
          <CardDescription>
            Each save closes the previous title period and starts tracking sales
            from today. Compare periods below to see if keyword changes helped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
            <div className="space-y-2">
              <label htmlFor="listing-title" className="text-sm font-medium">
                New title
              </label>
              <Input
                id="listing-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                required
              />
              <p className="text-xs text-muted-foreground">
                {title.length}/80 characters · active title:{" "}
                {activePeriod?.title ?? "—"}
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="title-notes" className="text-sm font-medium">
                Notes (optional)
              </label>
              <textarea
                id="title-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. Added '80mm' and 'chipboard screws' to front of title"
                rows={3}
                className={cn(
                  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
                )}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save title & start tracking"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => void loadExperiment()}
              >
                Refresh metrics
              </Button>
            </div>
            {saveMessage ? (
              <p className="text-sm text-muted-foreground">{saveMessage}</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card className="surface-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle>Title history & performance</CardTitle>
          <CardDescription>
            Metrics are pulled from eBay Analytics for each title period
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title used</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Search impr.</TableHead>
                <TableHead className="text-right">CTR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiment.periods.map((period) => (
                <TableRow key={period.id}>
                  <TableCell className="max-w-md">
                    <div className="space-y-2">
                      <p className="font-medium leading-snug">{period.title}</p>
                      <div className="flex flex-wrap gap-2">
                        {!period.endedAt ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="outline">Ended</Badge>
                        )}
                        {period.appliedToEbay ? (
                          <Badge variant="secondary">Pushed to eBay</Badge>
                        ) : null}
                      </div>
                      {period.notes ? (
                        <p className="text-xs text-muted-foreground">{period.notes}</p>
                      ) : null}
                      {period.ebayUpdateError ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          {period.ebayUpdateError}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateRange(period.startedAt, period.endedAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {period.metrics.daysTracked}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(period.metrics.transactions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(period.metrics.views)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(period.metrics.searchImpressions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(period.metrics.clickThroughRate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
