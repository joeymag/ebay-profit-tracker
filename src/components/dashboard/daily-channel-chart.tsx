"use client";

import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { DailyChannelPoint, DailyChannelSummary } from "@/lib/orders/daily-channel-stats";
import { cn } from "@/lib/utils";

type DailyChannelChartProps = {
  summary: DailyChannelSummary;
  currency: string;
  rangeLabel: string;
};

type ChartMode = "revenue" | "profit";

function maxValue(points: DailyChannelPoint[], mode: ChartMode): number {
  if (!points.length) {
    return 1;
  }

  if (mode === "revenue") {
    return Math.max(
      1,
      ...points.map((p) => Math.max(p.ebayRevenue, p.amazonRevenue, p.totalRevenue)),
    );
  }

  const magnitudes = points
    .filter((p) => p.hasProfitData)
    .map((p) => Math.abs(p.totalProfit));
  return Math.max(1, ...magnitudes, 0);
}

function Tooltip({
  point,
  currency,
  mode,
}: {
  point: DailyChannelPoint;
  currency: string;
  mode: ChartMode;
}) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-44 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md group-hover/day:block">
      <p className="font-semibold text-foreground">{point.label}</p>
      {mode === "revenue" ? (
        <>
          <p className="mt-1 text-sky-700 dark:text-sky-300">
            eBay: {formatMoney(point.ebayRevenue, currency)}
          </p>
          <p className="text-amber-700 dark:text-amber-300">
            Amazon: {formatMoney(point.amazonRevenue, currency)}
          </p>
          <p className="mt-1 font-medium">
            Total: {formatMoney(point.totalRevenue, currency)}
          </p>
        </>
      ) : point.hasProfitData ? (
        <>
          <p className="mt-1 text-sky-700 dark:text-sky-300">
            eBay: {formatMoney(point.ebayProfit, currency)}
          </p>
          <p className="text-amber-700 dark:text-amber-300">
            Amazon: {formatMoney(point.amazonProfit, currency)}
          </p>
          <p
            className={cn(
              "mt-1 font-medium",
              point.totalProfit >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            Total: {formatMoney(point.totalProfit, currency)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-muted-foreground">No cost data for this day</p>
      )}
    </div>
  );
}

export function DailyChannelChart({
  summary,
  currency,
  rangeLabel,
}: DailyChannelChartProps) {
  const [mode, setMode] = useState<ChartMode>("revenue");
  const { points } = summary;
  const scaleMax = useMemo(() => maxValue(points, mode), [points, mode]);

  if (!points.length) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Daily eBay &amp; Amazon performance</CardTitle>
          <CardDescription>No orders in {rangeLabel.toLowerCase()}.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="surface-card overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Daily eBay &amp; Amazon performance</CardTitle>
            <CardDescription>
              {rangeLabel} · revenue (takings) and profit/loss by day — scroll on
              smaller screens
            </CardDescription>
          </div>
          <div className="flex rounded-lg border border-border/60 bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setMode("revenue")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === "revenue"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Takings
            </button>
            <button
              type="button"
              onClick={() => setMode("profit")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === "profit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Profit / loss
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">Total takings</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatMoney(summary.totalRevenue, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">Total profit</p>
            <p
              className={cn(
                "mt-1 text-2xl font-bold tabular-nums",
                summary.totalProfit >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
            >
              {summary.daysWithProfitData > 0
                ? formatMoney(summary.totalProfit, currency)
                : "—"}
            </p>
            {summary.daysWithProfitData === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Add costs on orders to see profit
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">Best profit day</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {summary.bestProfitDay
                ? formatMoney(summary.bestProfitDay.totalProfit, currency)
                : "—"}
            </p>
            {summary.bestProfitDay ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.bestProfitDay.label}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-sm bg-sky-500" />
            eBay
          </span>
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-sm bg-amber-500" />
            Amazon
          </span>
          {mode === "profit" ? (
            <span className="text-muted-foreground">
              Green = profit · Red = loss · Grey = no cost data
            </span>
          ) : null}
        </div>

        <div className="overflow-x-auto pb-2">
          <div
            className="flex min-w-max items-end gap-1.5 px-1"
            style={{ minHeight: "14rem" }}
          >
            {points.map((point) => {
              const hasActivity =
                point.totalRevenue > 0 ||
                (point.hasProfitData && point.totalProfit !== 0);

              if (mode === "revenue") {
                const ebayHeight = (point.ebayRevenue / scaleMax) * 100;
                const amazonHeight = (point.amazonRevenue / scaleMax) * 100;

                return (
                  <div
                    key={point.date}
                    className="group/day relative flex w-10 flex-col items-center"
                  >
                    <Tooltip point={point} currency={currency} mode={mode} />
                    <div className="flex h-40 w-full items-end justify-center gap-0.5">
                      <div
                        className="w-3 rounded-t bg-sky-500 transition-all"
                        style={{ height: `${ebayHeight}%`, minHeight: point.ebayRevenue > 0 ? "4px" : 0 }}
                      />
                      <div
                        className="w-3 rounded-t bg-amber-500 transition-all"
                        style={{
                          height: `${amazonHeight}%`,
                          minHeight: point.amazonRevenue > 0 ? "4px" : 0,
                        }}
                      />
                    </div>
                    <p className="mt-2 w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
                      {point.label.replace(" ", "\u00a0")}
                    </p>
                  </div>
                );
              }

              const profitHeight = (Math.abs(point.totalProfit) / scaleMax) * 100;
              const barColor = !point.hasProfitData
                ? "bg-muted-foreground/30"
                : point.totalProfit >= 0
                  ? "bg-emerald-500"
                  : "bg-red-500";

              return (
                <div
                  key={point.date}
                  className="group/day relative flex w-10 flex-col items-center"
                >
                  <Tooltip point={point} currency={currency} mode={mode} />
                  <div className="flex h-40 w-full items-end justify-center">
                    <div
                      className={cn("w-6 rounded-t transition-all", barColor)}
                      style={{
                        height: point.hasProfitData ? `${profitHeight}%` : "4px",
                        minHeight: hasActivity ? undefined : 0,
                      }}
                    />
                  </div>
                  <p className="mt-2 w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
                    {point.label.replace(" ", "\u00a0")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Profit uses order costs where entered (product, postage, fees). Amazon
          monthly subscription is not split by day — see the dashboard total.
        </p>
      </CardContent>
    </Card>
  );
}
