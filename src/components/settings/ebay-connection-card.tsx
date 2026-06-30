"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EbayStatus = {
  env: string;
  clientKind?: string;
  ruNameKind?: string;
  warnings?: string[];
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasRuName: boolean;
  hasSupabaseServiceRoleKey?: boolean;
  isConfigured: boolean;
  isConnected: boolean;
};

type TestResult =
  | { ok: true; message: string; env: string }
  | { ok: false; error: string; hint?: string; details?: string };

export function EbayConnectionCard() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ebay/status");
      const data = (await res.json()) as EbayStatus & { ok?: boolean };
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const ebayParam = searchParams.get("ebay");
    const message = searchParams.get("message");

    if (ebayParam === "connected") {
      setBanner({ type: "success", text: "eBay account connected." });
      void loadStatus();
    } else if (ebayParam === "error") {
      setBanner({
        type: "error",
        text: message ?? "eBay authorization failed.",
      });
    }
  }, [searchParams, loadStatus]);

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ebay/test");
      const data = (await res.json()) as TestResult;
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Could not reach the test endpoint." });
    } finally {
      setTesting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/ebay/disconnect", { method: "POST" });
      setTestResult(null);
      await loadStatus();
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading eBay status…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {banner ? (
        <div
          className={
            banner.type === "success"
              ? "rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950"
              : "rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          }
        >
          {banner.text}
        </div>
      ) : null}

      {status?.warnings?.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">Configuration mismatch</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {status.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status?.isConnected ? "default" : "secondary"}>
          {status?.isConnected ? "Connected" : "Not connected"}
        </Badge>
        <Badge variant="outline">{status?.env ?? "sandbox"}</Badge>
      </div>

      <ul className="list-inside list-disc space-y-1 text-sm">
        <li>
          <code className="text-xs">EBAY_CLIENT_ID</code>{" "}
          {status?.hasClientId ? "✓" : "— missing"}
        </li>
        <li>
          <code className="text-xs">EBAY_CLIENT_SECRET</code>{" "}
          {status?.hasClientSecret ? "✓" : "— missing (Cert ID from developer portal)"}
        </li>
        <li>
          <code className="text-xs">EBAY_RU_NAME</code>{" "}
          {status?.hasRuName ? "✓" : "— missing (RuName from User Tokens)"}
        </li>
        <li>
          <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          {status?.hasSupabaseServiceRoleKey
            ? "✓"
            : "— missing on Vercel (required to save eBay token)"}
        </li>
      </ul>

      <p className="text-sm text-muted-foreground">
        OAuth scope:{" "}
        <code className="text-xs">sell.finances</code> — used to pull actual
        eBay fees per order via the Finances API.
      </p>

      <div className="flex flex-wrap gap-2">
        {status?.isConfigured ? (
          <Link href="/api/ebay/oauth/start" className={cn(buttonVariants())}>
            Connect eBay account
          </Link>
        ) : null}

        {status?.isConnected ? (
          <>
            <Button onClick={runTest} disabled={testing} type="button" variant="secondary">
              {testing ? (
                <>
                  <Loader2 className="animate-spin" />
                  Testing…
                </>
              ) : (
                "Test eBay connection"
              )}
            </Button>
            <Button
              onClick={disconnect}
              disabled={disconnecting}
              type="button"
              variant="outline"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </>
        ) : null}

        <a
          href="https://developer.ebay.com/my/keys"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "ghost" }), "gap-2")}
        >
          eBay Developer Portal
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      {testResult?.ok ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
          <Badge className="mb-2 bg-green-600">Token OK</Badge>
          <p>{testResult.message}</p>
        </div>
      ) : null}

      {testResult && !testResult.ok ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <Badge variant="destructive" className="mb-2">
            Failed
          </Badge>
          <p>{testResult.error}</p>
          {testResult.details ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {testResult.details}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
