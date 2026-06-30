"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type TestResult =
  | { ok: true; shop: { shopName: string; domain: string; currency: string; plan: string } }
  | { ok: false; error: string; hint?: string; status?: number };

export function ShopifyConnectionTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/shopify/test");
      const data = (await res.json()) as TestResult;
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Could not reach the test endpoint." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={runTest} disabled={loading} type="button">
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            Testing…
          </>
        ) : (
          "Test Shopify connection"
        )}
      </Button>

      {result?.ok ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
          <div className="mb-2 flex items-center gap-2">
            <Badge className="bg-green-600">Connected</Badge>
          </div>
          <p>
            <span className="text-muted-foreground">Store:</span>{" "}
            {result.shop.shopName}
          </p>
          <p>
            <span className="text-muted-foreground">Domain:</span>{" "}
            {result.shop.domain}
          </p>
          <p>
            <span className="text-muted-foreground">Currency:</span>{" "}
            {result.shop.currency}
          </p>
        </div>
      ) : null}

      {result && !result.ok ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <Badge variant="destructive" className="mb-2">
            Failed
          </Badge>
          <p>{result.error}</p>
          {result.hint ? (
            <p className="mt-2 text-muted-foreground">{result.hint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
