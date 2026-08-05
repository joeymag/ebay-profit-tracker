"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SyncFeesResult =
  | {
      ok: true;
      days: number;
      transactionsFetched: number;
      ebayOrders: number;
      matched: number;
      updated: number;
      updateFailures?: number;
      unmatchedOrderIds: number;
      sampleUnmatchedOrderIds?: string[];
      sampleTransactionOrderIds?: string[];
      syncedAt: string;
    }
  | { ok: false; error: string; details?: string; status?: number };

type EbayStatus = {
  isConnected?: boolean;
  hasSigningKey?: boolean;
  hasSupabaseServiceRoleKey?: boolean;
  warnings?: string[];
};

export function EbayFeesSyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ebay/status");
      const data = (await res.json()) as EbayStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    function onStatusChanged() {
      void loadStatus();
    }

    window.addEventListener("ebay-status-changed", onStatusChanged);
    return () => window.removeEventListener("ebay-status-changed", onStatusChanged);
  }, [loadStatus]);

  async function syncFees() {
    if (!status?.hasSigningKey) {
      setError(
        "Generate a signing key first using the button above, then try again.",
      );
      return;
    }

    if (!status?.isConnected) {
      setError("Connect your eBay account first, then try fee sync.");
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/ebay/fees/sync?days=120", {
        method: "POST",
      });
      const raw = await res.text();
      let data: SyncFeesResult;
      try {
        data = JSON.parse(raw) as SyncFeesResult;
      } catch {
        setError(
          res.ok
            ? "Fee sync returned an invalid response."
            : `Fee sync failed (${res.status}). The request may have timed out — try again or contact support if this persists.`,
        );
        return;
      }

      if (!data.ok) {
        setError(
          [data.error, data.details].filter(Boolean).join(" — ") ||
            `Fee sync failed (${data.status ?? res.status}).`,
        );
        return;
      }

      if (data.transactionsFetched === 0) {
        setError(
          "eBay returned no finance transactions for the last 120 days. Check that eBay is connected in production mode and the signing key is valid.",
        );
        return;
      }

      if (data.matched === 0) {
        setError(
          `Fetched ${data.transactionsFetched} eBay transactions but none matched your ${data.ebayOrders} stored eBay order IDs. Run Sync orders on the Orders page first, then try again.${
            data.sampleTransactionOrderIds?.length
              ? ` Sample eBay IDs: ${data.sampleTransactionOrderIds.join(", ")}.`
              : ""
          }`,
        );
        return;
      }

      if (data.updated === 0) {
        setError(
          `Matched ${data.matched} orders but saved 0 updates${
            data.updateFailures ? ` (${data.updateFailures} database errors)` : ""
          }. Check Supabase permissions.`,
        );
        return;
      }

      setMessage(
        `Synced ${data.updated} orders · ${data.matched} matched from eBay · ${data.unmatchedOrderIds} not found in last ${data.days} days · ${data.transactionsFetched} transactions fetched.`,
      );
      router.refresh();
    } catch {
      setError("Could not reach the eBay fee sync endpoint.");
    } finally {
      setLoading(false);
    }
  }

  const signingKeyMissing = status?.hasSigningKey === false;
  const notConnected = status?.isConnected === false;

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <p className="text-sm font-medium">eBay fee sync</p>
        <p className="text-sm text-muted-foreground">
          Pull actual eBay fees from the Finances API and update profit on
          matching orders (last 120 days). This can take up to a minute.
          {signingKeyMissing
            ? " You must generate a signing key in the section above first."
            : null}
          {notConnected ? " Connect eBay above before syncing fees." : null}
        </p>
      </div>
      <Button
        onClick={() => void syncFees()}
        disabled={loading || signingKeyMissing || notConnected}
        type="button"
        variant="secondary"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            Syncing eBay fees…
          </>
        ) : (
          "Sync eBay fees from eBay"
        )}
      </Button>
      {signingKeyMissing ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Step 1: click <strong>Generate signing key</strong> above. Step 2: sync
          fees here.
        </p>
      ) : null}
      {notConnected ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          eBay is not connected. Click <strong>Connect eBay account</strong>{" "}
          above first.
        </p>
      ) : null}
      {status?.warnings?.length ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {status.warnings.join(" ")}
        </p>
      ) : null}
      {message ? (
        <Badge variant="secondary" className="font-normal">
          {message}
        </Badge>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
