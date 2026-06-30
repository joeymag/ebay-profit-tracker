"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SyncProductsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function syncProducts() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-from-orders" }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Sync failed");
        return;
      }

      setMessage(data.message);
      router.refresh();
    } catch {
      setError("Could not sync products.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={loading}
        onClick={syncProducts}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            Importing SKUs…
          </>
        ) : (
          "Import SKUs from orders"
        )}
      </Button>
      {message ? (
        <Badge variant="secondary" className="font-normal">
          {message}
        </Badge>
      ) : null}
      {error ? <p className="text-base text-destructive">{error}</p> : null}
    </div>
  );
}
