"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

type ExportOrdersCsvButtonProps = {
  orderCount: number;
};

export function ExportOrdersCsvButton({ orderCount }: ExportOrdersCsvButtonProps) {
  const searchParams = useSearchParams();

  function handleExport() {
    const params = new URLSearchParams();
    const range = searchParams.get("range");
    const channel = searchParams.get("channel");
    const product = searchParams.get("product");

    if (range) {
      params.set("range", range);
    }
    if (channel) {
      params.set("channel", channel);
    }
    if (product) {
      params.set("product", product);
    }

    const query = params.toString();
    window.location.href = query
      ? `/api/orders/export?${query}`
      : "/api/orders/export";
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={orderCount === 0}
      onClick={handleExport}
    >
      <Download className="size-4" />
      Export CSV
    </Button>
  );
}
