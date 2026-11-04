"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type DeleteOrderButtonProps = {
  shopifyId: number;
  orderNumber: string;
  backHref?: string;
  cancelled?: boolean;
};

export function DeleteOrderButton({
  shopifyId,
  orderNumber,
  backHref = "/orders",
  cancelled = false,
}: DeleteOrderButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      cancelled
        ? `Remove cancelled order ${orderNumber} from the profit tracker?\n\nIt will not re-import on the next sync.`
        : `Remove ${orderNumber} from the profit tracker?\n\nUse this for duplicates, cancelled orders, or anything that should not count in profit. It will not come back on sync, and this does not cancel it in Shopify.`,
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${shopifyId}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to delete order");
        return;
      }

      router.push(backHref);
      router.refresh();
    } catch {
      setError("Failed to delete order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant={cancelled ? "destructive" : "outline"}
        size="sm"
        className="gap-2"
        disabled={loading}
        onClick={handleDelete}
      >
        <Trash2 className="size-4" />
        {loading
          ? "Removing…"
          : cancelled
            ? "Remove cancelled order"
            : "Remove from tracker"}
      </Button>
      {error ? (
        <p className="max-w-xs text-right text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
