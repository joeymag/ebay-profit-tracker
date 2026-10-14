"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

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
import type { AccountPayment } from "@/lib/accounting/payments";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Channel = "ebay" | "amazon" | "temu";

const COPY: Record<Channel, { title: string; description: string }> = {
  ebay: {
    title: "eBay payments",
    description: "Sales, fees, refunds, and payouts from the last 30 days.",
  },
  amazon: {
    title: "Amazon transactions",
    description:
      "Released and deferred transactions from the Amazon.co.uk account for the last 30 days.",
  },
  temu: {
    title: "Temu payments",
    description: "Order payments, refunds, and shipping label purchases from the Temu payments report.",
  },
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function moneyCell(amount: number | null | undefined, currency: string) {
  if (amount == null) return "—";
  return formatMoney(amount, currency);
}

export function AccountPaymentsTable({ channel }: { channel: Channel }) {
  const copy = COPY[channel];
  const [payments, setPayments] = useState<AccountPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/${channel}/payments`);
      const payload = (await response.json()) as {
        ok: boolean;
        payments?: AccountPayment[];
        warning?: string | null;
        error?: string;
      };
      if (!payload.ok) {
        setPayments([]);
        setWarning(null);
        setError(payload.error ?? "Could not load payments.");
        return;
      }
      setPayments(payload.payments ?? []);
      setWarning(payload.warning ?? null);
    } catch {
      setPayments([]);
      setError("Could not load payments.");
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return payments;
    return payments.filter((payment) =>
      [payment.type, payment.status, payment.reference, payment.description, payment.batchId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [payments, query]);

  const total = filtered.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
  const currency = filtered.find((payment) => payment.currency)?.currency ?? "GBP";

  return (
    <Card className="surface-card overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>
              {copy.description}
              {filtered.length > 0
                ? ` ${filtered.length.toLocaleString("en-GB")} shown · ${formatMoney(total, currency)}`
                : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={channel === "temu" ? "Search order, type, batch" : "Search order, type, description"}
              className="w-64"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {warning ? (
          <p className="border-b border-border/50 px-6 py-3 text-sm text-muted-foreground">
            {warning}
          </p>
        ) : null}
        {error ? (
          <p className="p-6 text-sm text-muted-foreground">{error}</p>
        ) : loading && payments.length === 0 ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {channel === "temu" ? "Loading the Temu payments report…" : "Loading payments…"}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No payments in the last 30 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {channel === "temu" ? (
                    <>
                      <TableHead>Transaction type</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Batch ID</TableHead>
                      <TableHead className="text-right">Total product charges</TableHead>
                      <TableHead className="text-right">Others</TableHead>
                      <TableHead className="text-right">Total amount</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">
                      {channel === "temu"
                        ? new Date(payment.date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : formatWhen(payment.date)}
                    </TableCell>
                    {channel === "temu" ? (
                      <>
                        <TableCell>{payment.type}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {payment.reference ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate font-mono text-xs">
                          {payment.batchId ?? "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            (payment.productCharges ?? 0) < 0 && "text-red-700 dark:text-red-300",
                          )}
                        >
                          {moneyCell(payment.productCharges, payment.currency)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            (payment.otherAmount ?? 0) < 0 && "text-red-700 dark:text-red-300",
                          )}
                        >
                          {moneyCell(payment.otherAmount, payment.currency)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            (payment.amount ?? 0) < 0
                              ? "text-red-700 dark:text-red-300"
                              : "text-emerald-700 dark:text-emerald-300",
                          )}
                        >
                          {moneyCell(payment.amount, payment.currency)}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{payment.status}</TableCell>
                        <TableCell>{payment.type}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {payment.reference ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {payment.description}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            (payment.amount ?? 0) < 0
                              ? "text-red-700 dark:text-red-300"
                              : "text-emerald-700 dark:text-emerald-300",
                          )}
                        >
                          {moneyCell(payment.amount, payment.currency)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
