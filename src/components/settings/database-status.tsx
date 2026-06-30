"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DatabaseStatusProps = {
  backend: "supabase" | "json";
};

export function DatabaseStatus({ backend }: DatabaseStatusProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function migrateFromJson() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/db/migrate-from-json", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Migration failed");
        return;
      }
      setMessage(data.message);
    } catch {
      setError("Could not run migration.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/25 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-base font-semibold">Storage</span>
        <Badge variant={backend === "supabase" ? "default" : "secondary"}>
          {backend === "supabase" ? "Supabase" : "Local JSON file"}
        </Badge>
      </div>
      {backend === "supabase" ? (
        <p className="text-base leading-relaxed text-muted-foreground">
          Orders are saved in Supabase. Sync writes to the database — the UI
          reads from there, not Shopify. If import fails with “table not
          found”, open Supabase → SQL Editor and run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">supabase/migrations/001_orders_schema.sql</code>.
        </p>
      ) : (
        <p className="text-base leading-relaxed text-muted-foreground">
          Add Supabase env vars to <code className="rounded bg-muted px-1.5 py-0.5 text-sm">.env.local</code>{" "}
          and restart the dev server to use the database.
        </p>
      )}
      {backend === "supabase" ? (
        <Button
          type="button"
          variant="outline"
          size="default"
          disabled={loading}
          onClick={migrateFromJson}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              Importing…
            </>
          ) : (
            "Import existing orders.json into Supabase"
          )}
        </Button>
      ) : null}
      {message ? <p className="text-base text-primary">{message}</p> : null}
      {error ? <p className="text-base text-destructive">{error}</p> : null}
    </div>
  );
}
