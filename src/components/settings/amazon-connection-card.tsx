"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AmazonStatus = {
  env: string;
  region: string;
  marketplaceId?: string;
  warnings?: string[];
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasSupabaseServiceRoleKey?: boolean;
  isConfigured: boolean;
  isConnected: boolean;
};

type TestResult =
  | { ok: true; message: string; env: string }
  | { ok: false; error: string; details?: string };

export function AmazonConnectionCard() {
  const [status, setStatus] = useState<AmazonStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/amazon/status");
      const data = (await res.json()) as AmazonStatus;
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

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/amazon/test");
      const data = (await res.json()) as TestResult;
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Could not reach the test endpoint." });
    } finally {
      setTesting(false);
    }
  }

  async function connect() {
    setConnecting(true);
    setConnectError(null);
    setConnectSuccess(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/amazon/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (!data.ok) {
        setConnectError(data.error ?? "Could not connect Amazon.");
        return;
      }
      setConnectSuccess(data.message ?? "Amazon account connected.");
      setRefreshToken("");
      await loadStatus();
    } catch {
      setConnectError("Could not reach the connect endpoint.");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/amazon/disconnect", { method: "POST" });
      setTestResult(null);
      setConnectSuccess(null);
      await loadStatus();
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Amazon status…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status?.warnings?.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <ul className="list-inside list-disc space-y-1">
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
        <Badge variant="outline">
          {(status?.region ?? "eu").toUpperCase()}
        </Badge>
        {status?.marketplaceId ? (
          <Badge variant="outline" className="font-mono text-[10px]">
            {status.marketplaceId}
          </Badge>
        ) : null}
      </div>

      <ul className="list-inside list-disc space-y-1 text-sm">
        <li>
          <code className="text-xs">AMAZON_CLIENT_ID</code>{" "}
          {status?.hasClientId ? "✓" : "— missing (LWA client identifier)"}
        </li>
        <li>
          <code className="text-xs">AMAZON_CLIENT_SECRET</code>{" "}
          {status?.hasClientSecret ? "✓" : "— missing"}
        </li>
        <li>
          <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          {status?.hasSupabaseServiceRoleKey
            ? "✓"
            : "— missing on Vercel (required to save refresh token)"}
        </li>
      </ul>

      <p className="text-sm text-muted-foreground">
        Unlike eBay, private Amazon apps use{" "}
        <strong className="font-medium text-foreground">self-authorization</strong>
        : create a refresh token in the{" "}
        <a
          href="https://solutionproviderportal.amazon.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Solution Provider Portal
        </a>{" "}
        (sandbox: View sandbox credentials → Create Token) or Seller Central →
        Authorize app, then paste it below. See{" "}
        <a
          href="https://developer-docs.amazon.com/sp-api/docs/onboarding-step-5-make-your-first-call-to-the-sp-api-sandbox"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          SP-API onboarding Step 5
        </a>
        .
      </p>

      {status?.isConfigured ? (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="amazon-refresh-token">
            {status.isConnected ? "Replace refresh token" : "Refresh token"}
          </label>
          <Input
            id="amazon-refresh-token"
            type="password"
            autoComplete="off"
            placeholder="Atzr|…"
            value={refreshToken}
            onChange={(event) => setRefreshToken(event.target.value)}
          />
          <Button
            type="button"
            onClick={connect}
            disabled={connecting || !refreshToken.trim()}
          >
            {connecting ? (
              <>
                <Loader2 className="animate-spin" />
                Connecting…
              </>
            ) : status.isConnected ? (
              "Save new token"
            ) : (
              "Connect Amazon account"
            )}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add <code className="text-xs">AMAZON_CLIENT_ID</code> and{" "}
          <code className="text-xs">AMAZON_CLIENT_SECRET</code> to{" "}
          <code className="text-xs">.env.local</code> / Vercel first.
        </p>
      )}

      {connectSuccess ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
          {connectSuccess}
        </div>
      ) : null}

      {connectError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {connectError}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status?.isConnected ? (
          <>
            <Button onClick={runTest} disabled={testing} type="button" variant="secondary">
              {testing ? (
                <>
                  <Loader2 className="animate-spin" />
                  Testing…
                </>
              ) : (
                "Test Amazon connection"
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
          href="https://solutionproviderportal.amazon.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "ghost" }), "gap-2")}
        >
          Solution Provider Portal
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
