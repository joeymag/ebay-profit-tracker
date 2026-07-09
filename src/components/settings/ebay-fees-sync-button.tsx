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
      unmatchedOrderIds: number;
      syncedAt: string;
    }
  | { ok: false; error: string; details?: string };

export function EbayFeesSyncButton() {
  const router = useRouter();
  const [hasSigningKey, setHasSigningKey] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSigningKeyStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ebay/signing-key");
      const data = (await res.json()) as { hasSigningKey?: boolean };
      setHasSigningKey(Boolean(data.hasSigningKey));
    } catch {
      setHasSigningKey(null);
    }
  }, []);

  useEffect(() => {
    void loadSigningKeyStatus();
  }, [loadSigningKeyStatus]);

  useEffect(() => {
    function onStatusChanged() {
      void loadSigningKeyStatus();
    }

    window.addEventListener("ebay-status-changed", onStatusChanged);
    return () => window.removeEventListener("ebay-status-changed", onStatusChanged);
  }, [loadSigningKeyStatus]);

  async function syncFees() {
    if (!hasSigningKey) {
      setError(
        "Generate a signing key first using the button above, then try again.",
      );
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/ebay/fees/sync?days=120", {
        method: "POST",
      });
      const data = (await res.json()) as SyncFeesResult;

      if (!data.ok) {
        setError(
          [data.error, data.details].filter(Boolean).join(" — ") ||
            "Fee sync failed.",
        );
        return;
      }

      setMessage(
        `Synced ${data.updated} orders · ${data.matched} matched from eBay · ${data.unmatchedOrderIds} not found in last ${data.days} days.`,
      );
      router.refresh();
    } catch {
      setError("Could not reach the eBay fee sync endpoint.");
    } finally {
      setLoading(false);
    }
  }

  const signingKeyMissing = hasSigningKey === false;

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <p className="text-sm font-medium">eBay fee sync</p>
        <p className="text-sm text-muted-foreground">
          Pull actual eBay fees from the Finances API and update profit on
          matching orders (last 120 days).
          {signingKeyMissing
            ? " You must generate a signing key in the section above first."
            : null}
        </p>
      </div>
      <Button
        onClick={syncFees}
        disabled={loading || signingKeyMissing}
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
      {message ? (
        <Badge variant="secondary" className="font-normal">
          {message}
        </Badge>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
