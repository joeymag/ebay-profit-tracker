"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";

type FeeCategoryTotal = {
  category: string;
  amount: number;
  lineCount: number;
};

type FeesSummary = {
  year: number;
  month: number;
  label: string;
  currency: string;
  totalFees: number;
  settledProductSales?: number;
  vatRate?: number;
  vatOnSales?: number;
  salesExVat?: number;
  sellingFeesExVat?: number;
  vatOnSellingFees?: number;
  subscriptionExVat?: number;
  vatOnSubscription?: number;
  orderCount?: number;
  ordersMissingFees?: number;
  categories: FeeCategoryTotal[];
  transactionCount: number;
  feeLineCount: number;
};

type SummaryResponse =
  | { ok: true; summary: FeesSummary }
  | { ok: false; error: string };

function defaultPeriod(): { year: number; month: number } {
  const now = new Date();
  const previous = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  return {
    year: previous.getUTCFullYear(),
    month: previous.getUTCMonth() + 1,
  };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function AmazonMonthlyFeesCard() {
  const initial = useMemo(() => defaultPeriod(), []);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [summary, setSummary] = useState<FeesSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => {
    const current = new Date().getUTCFullYear();
    return [current, current - 1, current - 2];
  }, []);

  const query = useMemo(
    () => `year=${year}&month=${month}`,
    [year, month],
  );

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/amazon/fees/monthly?${query}`);
      const payload = (await response.json()) as SummaryResponse;
      if (!payload.ok) {
        setSummary(null);
        setError(payload.error);
        return;
      }
      setSummary(payload.summary);
    } catch {
      setSummary(null);
      setError("Could not load Amazon fees for that month.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const downloadPdf = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/amazon/fees/monthly?${query}&format=pdf`,
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error || "Could not build the fees PDF.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const monthPad = String(month).padStart(2, "0");
      link.href = url;
      link.download = `amazon-fees-${year}-${monthPad}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the fees PDF.");
    } finally {
      setDownloading(false);
    }
  }, [query, year, month]);

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>Monthly Amazon fees (QuickBooks)</CardTitle>
        <CardDescription>
          Starts from Amazon orders placed that month (the same ones that come
          into this app), looks up each order’s real fees, then adds the
          selling subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="amazon-fees-month"
              className="text-sm font-medium text-muted-foreground"
            >
              Month
            </label>
            <select
              id="amazon-fees-month"
              className="flex h-9 min-w-[10rem] rounded-lg border border-input bg-background px-2 text-sm text-foreground [color-scheme:light]"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              disabled={loading || downloading}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1} className="bg-white text-zinc-900">
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="amazon-fees-year"
              className="text-sm font-medium text-muted-foreground"
            >
              Year
            </label>
            <select
              id="amazon-fees-year"
              className="flex h-9 min-w-[6rem] rounded-lg border border-input bg-background px-2 text-sm text-foreground [color-scheme:light]"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              disabled={loading || downloading}
            >
              {years.map((value) => (
                <option key={value} value={value} className="bg-white text-zinc-900">
                  {value}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void loadSummary()}
            disabled={loading || downloading}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Pulling fees…
              </>
            ) : (
              <>
                <FileText className="size-4" />
                Pull fees
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void downloadPdf()}
            disabled={loading || downloading}
          >
            {downloading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Building PDF…
              </>
            ) : (
              <>
                <Download className="size-4" />
                Download PDF
              </>
            )}
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        {summary ? (
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            <p className="text-sm font-medium">{summary.label}</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Sold for (inc VAT)
                  <span className="ml-2 text-xs">
                    ({summary.orderCount ?? 0} order
                    {(summary.orderCount ?? 0) === 1 ? "" : "s"})
                  </span>
                </span>
                <span className="tabular-nums text-base font-semibold">
                  {formatMoney(summary.settledProductSales ?? 0, summary.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  of which VAT ({Math.round((summary.vatRate ?? 0.2) * 100)}%)
                </span>
                <span className="tabular-nums text-base font-semibold">
                  {formatMoney(summary.vatOnSales ?? 0, summary.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Sold for (ex VAT)</span>
                <span className="tabular-nums text-base font-semibold">
                  {formatMoney(summary.salesExVat ?? 0, summary.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Fees paid to Amazon</span>
                <span className="tabular-nums text-base font-semibold">
                  {formatMoney(summary.totalFees, summary.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-sm">
                <span className="font-medium">Left after Amazon fees</span>
                <span className="tabular-nums text-lg font-semibold">
                  {formatMoney(
                    (summary.settledProductSales ?? 0) - summary.totalFees,
                    summary.currency,
                  )}
                </span>
              </div>
            </div>
            <div className="space-y-2 border-t border-border/60 pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Fees for QuickBooks (2 lines)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-1.5 font-medium">Type</th>
                      <th className="pb-1.5 text-right font-medium">Net</th>
                      <th className="pb-1.5 text-right font-medium">VAT %</th>
                      <th className="pb-1.5 text-right font-medium">Tax</th>
                      <th className="pb-1.5 text-right font-medium">Gross</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    <tr>
                      <td className="py-1 text-muted-foreground">
                        Referral / commission
                      </td>
                      <td className="py-1 text-right font-medium">
                        {formatMoney(
                          summary.sellingFeesExVat ?? 0,
                          summary.currency,
                        )}
                      </td>
                      <td className="py-1 text-right text-muted-foreground">
                        {Math.round((summary.vatRate ?? 0.2) * 100)}
                      </td>
                      <td className="py-1 text-right font-medium">
                        {formatMoney(
                          summary.vatOnSellingFees ?? 0,
                          summary.currency,
                        )}
                      </td>
                      <td className="py-1 text-right font-semibold">
                        {formatMoney(
                          (summary.sellingFeesExVat ?? 0) +
                            (summary.vatOnSellingFees ?? 0),
                          summary.currency,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-muted-foreground">
                        Selling subscription
                      </td>
                      <td className="py-1 text-right font-medium">
                        {formatMoney(
                          summary.subscriptionExVat ?? 0,
                          summary.currency,
                        )}
                      </td>
                      <td className="py-1 text-right text-muted-foreground">
                        {Math.round((summary.vatRate ?? 0.2) * 100)}
                      </td>
                      <td className="py-1 text-right font-medium">
                        {formatMoney(
                          summary.vatOnSubscription ?? 0,
                          summary.currency,
                        )}
                      </td>
                      <td className="py-1 text-right font-semibold">
                        {formatMoney(
                          (summary.subscriptionExVat ?? 0) +
                            (summary.vatOnSubscription ?? 0),
                          summary.currency,
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Commission + digital services fee are combined into Referral /
                commission.
                {(summary.ordersMissingFees ?? 0) > 0 ? (
                  <>
                    {" "}
                    · {summary.ordersMissingFees} still waiting on Amazon fee
                    data
                  </>
                ) : null}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose a month, pull fees to preview the split, then download the
            PDF for QuickBooks.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
