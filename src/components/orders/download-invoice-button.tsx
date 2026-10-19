"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";

type DownloadInvoiceButtonProps = {
  shopifyId: number;
  orderNumber: string;
};

export function DownloadInvoiceButton({
  shopifyId,
  orderNumber,
}: DownloadInvoiceButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${shopifyId}/invoice`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Could not create the invoice.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoice-${orderNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download invoice.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading}
        onClick={() => void handleDownload()}
      >
        <FileDown className="size-4" />
        {loading ? "Preparing invoice…" : "Download invoice"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
