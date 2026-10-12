"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TemuStatus = {
  warnings?: string[];
  region: "eu" | "us" | "global";
  mallId: string | null;
  isConnected: boolean;
  fromEnv: boolean;
};

type TestResult = { ok: true; message: string } | { ok: false; error: string };

export function TemuConnectionCard() {
  const [status, setStatus] = useState<TemuStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [region, setRegion] = useState<"eu" | "us" | "global">("eu");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/temu/status");
      const data = (await res.json()) as TemuStatus;
      setStatus(data);
      setRegion(data.region ?? "eu");
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function connect() {
    setConnecting(true);
    setConnectError(null);
    setConnectSuccess(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/temu/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey, appSecret, accessToken, region }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (!data.ok) {
        setConnectError(data.error ?? "Could not connect Temu.");
        return;
      }
      setConnectSuccess(data.message ?? "Temu connected.");
      setAppKey("");
      setAppSecret("");
      setAccessToken("");
      await loadStatus();
    } catch {
      setConnectError("Could not reach the connect endpoint.");
    } finally {
      setConnecting(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/temu/test", { method: "POST" });
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
      await fetch("/api/temu/disconnect", { method: "POST" });
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
        Loading Temu status…
      </div>
    );
  }

  const canSave = Boolean(appKey.trim() && appSecret.trim() && accessToken.trim());

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
        {status?.mallId ? (
          <span className="text-sm text-muted-foreground">Shop id {status.mallId}</span>
        ) : null}
        {status?.fromEnv ? (
          <span className="text-sm text-muted-foreground">Using environment keys</span>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Paste the app key, app secret, and access token from the Temu Partner
        Platform. The UK shop uses the EU endpoint. The keys are checked with
        Temu before they are saved.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor="temu-region">
            Shop region
          </label>
          <select
            id="temu-region"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={region}
            onChange={(event) =>
              setRegion(event.target.value as "eu" | "us" | "global")
            }
          >
            <option value="eu">EU (United Kingdom)</option>
            <option value="us">United States</option>
            <option value="global">Global</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="temu-app-key">
            App key
          </label>
          <Input
            id="temu-app-key"
            autoComplete="off"
            value={appKey}
            onChange={(event) => setAppKey(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="temu-app-secret">
            App secret
          </label>
          <Input
            id="temu-app-secret"
            type="password"
            autoComplete="off"
            value={appSecret}
            onChange={(event) => setAppSecret(event.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor="temu-access-token">
            Access token
          </label>
          <Input
            id="temu-access-token"
            type="password"
            autoComplete="off"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
          />
        </div>
      </div>

      <Button type="button" onClick={connect} disabled={connecting || !canSave}>
        {connecting ? (
          <>
            <Loader2 className="animate-spin" />
            Checking keys…
          </>
        ) : status?.isConnected ? (
          "Save new keys"
        ) : (
          "Connect Temu"
        )}
      </Button>

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

      {status?.isConnected && !status.fromEnv ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={runTest} disabled={testing} type="button" variant="secondary">
            {testing ? (
              <>
                <Loader2 className="animate-spin" />
                Testing…
              </>
            ) : (
              "Test Temu connection"
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
        </div>
      ) : null}

      {testResult?.ok ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
          <Badge className="mb-2 bg-green-600">Keys OK</Badge>
          <p>{testResult.message}</p>
        </div>
      ) : null}
      {testResult && !testResult.ok ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <Badge variant="destructive" className="mb-2">
            Failed
          </Badge>
          <p>{testResult.error}</p>
        </div>
      ) : null}
    </div>
  );
}
