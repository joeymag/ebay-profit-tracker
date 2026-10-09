"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

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
import { cn } from "@/lib/utils";

type Status = {
  env: string;
  isConfigured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasSupabaseServiceRoleKey: boolean;
  isConnected: boolean;
  companyName: string | null;
};

type EbayFunds = {
  amount: number | null;
  currency: string;
};

type EbayBalance = {
  ok: true;
  currency: string;
  available: EbayFunds;
  processing: EbayFunds;
  onHold: EbayFunds;
  total: EbayFunds;
};

type AmazonBalance = {
  ok: true;
  currency: string;
  balance: number;
  payingOut: number;
  lastPayout: number | null;
  lastPayoutDate: string | null;
};

type Transaction = {
  id: string;
  txn_date: string;
  txn_type: string | null;
  doc_number: string | null;
  name: string | null;
  memo: string | null;
  account_name: string | null;
  split_account: string | null;
  amount: number;
  synced_at: string;
};

export function AccountingPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ebayBalance, setEbayBalance] = useState<EbayBalance | null>(null);
  const [ebayBalanceError, setEbayBalanceError] = useState<string | null>(null);
  const [ebayBalanceLoading, setEbayBalanceLoading] = useState(true);
  const [amazonBalance, setAmazonBalance] = useState<AmazonBalance | null>(null);
  const [amazonBalanceError, setAmazonBalanceError] = useState<string | null>(
    null,
  );
  const [amazonBalanceLoading, setAmazonBalanceLoading] = useState(true);

  const loadEbayBalance = useCallback(async () => {
    setEbayBalanceLoading(true);
    setEbayBalanceError(null);
    try {
      const response = await fetch("/api/ebay/balance");
      const payload = (await response.json()) as EbayBalance & {
        ok: boolean;
        error?: string;
      };
      if (!payload.ok) {
        setEbayBalance(null);
        setEbayBalanceError(payload.error ?? "Could not load the eBay balance.");
        return;
      }
      setEbayBalance(payload);
    } catch {
      setEbayBalance(null);
      setEbayBalanceError("Could not load the eBay balance.");
    } finally {
      setEbayBalanceLoading(false);
    }
  }, []);

  const loadAmazonBalance = useCallback(async () => {
    setAmazonBalanceLoading(true);
    setAmazonBalanceError(null);
    try {
      const response = await fetch("/api/amazon/balance");
      const payload = (await response.json()) as AmazonBalance & {
        ok: boolean;
        error?: string;
      };
      if (!payload.ok) {
        setAmazonBalance(null);
        setAmazonBalanceError(
          payload.error ?? "Could not load the Amazon balance.",
        );
        return;
      }
      setAmazonBalance(payload);
    } catch {
      setAmazonBalance(null);
      setAmazonBalanceError("Could not load the Amazon balance.");
    } finally {
      setAmazonBalanceLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, txnRes] = await Promise.all([
        fetch("/api/quickbooks/status"),
        fetch("/api/quickbooks/transactions?days=90"),
        loadEbayBalance(),
        loadAmazonBalance(),
      ]);
      const statusPayload = (await statusRes.json()) as Status;
      const txnPayload = (await txnRes.json()) as {
        ok: boolean;
        transactions?: Transaction[];
        error?: string;
      };
      setStatus(statusPayload);
      setTransactions(txnPayload.transactions ?? []);
      if (!txnPayload.ok && txnPayload.error) {
        setError(txnPayload.error);
      }
    } catch {
      setError("Could not load accounting data.");
    } finally {
      setLoading(false);
    }
  }, [loadEbayBalance, loadAmazonBalance]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const result = searchParams.get("quickbooks");
    const text = searchParams.get("message");
    if (result === "connected") {
      setMessage("QuickBooks connected. Sync to pull transactions.");
    } else if (result === "error") {
      setError(text ?? "QuickBooks authorization failed.");
    }
  }, [searchParams]);

  async function sync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/quickbooks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 90 }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        imported?: number;
        companyName?: string | null;
        error?: string;
      };
      if (!payload.ok) {
        setError(payload.error ?? "Sync failed.");
        return;
      }
      setMessage(
        `Imported ${payload.imported ?? 0} QuickBooks transaction${payload.imported === 1 ? "" : "s"} from the last 90 days.`,
      );
      await load();
    } catch {
      setError("Could not sync QuickBooks.");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/quickbooks/disconnect", { method: "POST" });
      setTransactions([]);
      setMessage("QuickBooks disconnected.");
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return transactions;
    return transactions.filter((txn) =>
      [txn.txn_type, txn.name, txn.memo, txn.account_name, txn.split_account, txn.doc_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, transactions]);

  const totals = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const txn of filtered) {
      const amount = Number(txn.amount);
      if (amount >= 0) moneyIn += amount;
      else moneyOut += Math.abs(amount);
    }
    return { moneyIn, moneyOut, net: moneyIn - moneyOut };
  }, [filtered]);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading accounting…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <Card className="surface-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>eBay balance</CardTitle>
              <CardDescription>
                Available funds in your eBay seller account right now.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadEbayBalance()}
              disabled={ebayBalanceLoading}
            >
              {ebayBalanceLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {ebayBalanceError ? (
            <p className="text-sm text-muted-foreground">{ebayBalanceError}</p>
          ) : ebayBalance ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {ebayBalance.available.amount != null
                    ? formatMoney(
                        ebayBalance.available.amount,
                        ebayBalance.available.currency,
                      )
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Processing</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {ebayBalance.processing.amount != null
                    ? formatMoney(
                        ebayBalance.processing.amount,
                        ebayBalance.processing.currency,
                      )
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">On hold</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {ebayBalance.onHold.amount != null
                    ? formatMoney(
                        ebayBalance.onHold.amount,
                        ebayBalance.onHold.currency,
                      )
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {ebayBalance.total.amount != null
                    ? formatMoney(
                        ebayBalance.total.amount,
                        ebayBalance.total.currency,
                      )
                    : "—"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading eBay balance…</p>
          )}
        </CardContent>
      </Card>

      <Card className="surface-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Amazon balance</CardTitle>
              <CardDescription>
                Open settlement still in your Amazon seller account, plus any
                payout already on its way to the bank.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadAmazonBalance()}
              disabled={amazonBalanceLoading}
            >
              {amazonBalanceLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {amazonBalanceError ? (
            <p className="text-sm text-muted-foreground">{amazonBalanceError}</p>
          ) : amazonBalance ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Current balance</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(amazonBalance.balance, amazonBalance.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paying out</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(amazonBalance.payingOut, amazonBalance.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last payout</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {amazonBalance.lastPayout != null
                    ? formatMoney(
                        amazonBalance.lastPayout,
                        amazonBalance.currency,
                      )
                    : "—"}
                </p>
                {amazonBalance.lastPayoutDate ? (
                  <p className="text-xs text-muted-foreground">
                    {new Date(amazonBalance.lastPayoutDate).toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Loading Amazon balance…
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="surface-card">
        <CardHeader>
          <CardTitle>QuickBooks</CardTitle>
          <CardDescription>
            Pull categorised transactions from QuickBooks Online. Items still
            in For Review on the bank feed are not included until they are
            matched in QuickBooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status?.isConnected ? "default" : "secondary"}>
              {status?.isConnected ? "Connected" : "Not connected"}
            </Badge>
            <Badge variant="outline">{status?.env ?? "production"}</Badge>
            {status?.companyName ? (
              <span className="text-sm text-muted-foreground">
                {status.companyName}
              </span>
            ) : null}
          </div>

          {!status?.isConfigured ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Create a QuickBooks app at{" "}
                <a
                  href="https://developer.intuit.com/app/developer/dashboard"
                  className="underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  developer.intuit.com
                </a>
                , then add these to <code className="text-xs">.env.local</code>{" "}
                and Vercel:
              </p>
              <ul className="list-inside list-disc">
                <li>
                  <code className="text-xs">QUICKBOOKS_CLIENT_ID</code>
                </li>
                <li>
                  <code className="text-xs">QUICKBOOKS_CLIENT_SECRET</code>
                </li>
                <li>
                  <code className="text-xs">QUICKBOOKS_ENV=production</code>
                </li>
              </ul>
              <p>
                Redirect URI:{" "}
                <code className="text-xs">
                  https://your-domain/api/quickbooks/oauth/callback
                </code>
                . Scope: <code className="text-xs">com.intuit.quickbooks.accounting</code>.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {status.isConnected ? (
                <>
                  <Button type="button" onClick={() => void sync()} disabled={syncing}>
                    {syncing ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Syncing…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-4" />
                        Sync last 90 days
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void disconnect()}
                    disabled={disconnecting}
                  >
                    {disconnecting ? "Disconnecting…" : "Disconnect"}
                  </Button>
                </>
              ) : (
                <Link
                  href="/api/quickbooks/oauth/start"
                  className={cn(buttonVariants())}
                >
                  Connect QuickBooks
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {status?.isConnected ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="surface-card">
              <CardHeader className="pb-2">
                <CardDescription>Money in</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatMoney(totals.moneyIn)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="surface-card">
              <CardHeader className="pb-2">
                <CardDescription>Money out</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatMoney(totals.moneyOut)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="surface-card">
              <CardHeader className="pb-2">
                <CardDescription>Net</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatMoney(totals.net)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="surface-card overflow-hidden">
            <CardHeader className="border-b border-border/50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Transactions</CardTitle>
                  <CardDescription>
                    {filtered.length.toLocaleString("en-GB")} shown from the last
                    90 days
                  </CardDescription>
                </div>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, memo, account"
                  className="w-64"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No transactions yet. Sync after they are categorised in
                  QuickBooks.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Memo</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((txn) => {
                        const amount = Number(txn.amount);
                        return (
                          <TableRow key={txn.id}>
                            <TableCell className="whitespace-nowrap">
                              {txn.txn_date}
                            </TableCell>
                            <TableCell>{txn.txn_type ?? "—"}</TableCell>
                            <TableCell>{txn.name ?? "—"}</TableCell>
                            <TableCell className="max-w-xs truncate">
                              {txn.memo ?? "—"}
                            </TableCell>
                            <TableCell>{txn.account_name ?? "—"}</TableCell>
                            <TableCell
                              className={cn(
                                "text-right tabular-nums",
                                amount < 0
                                  ? "text-red-700 dark:text-red-300"
                                  : "text-emerald-700 dark:text-emerald-300",
                              )}
                            >
                              {formatMoney(amount)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
