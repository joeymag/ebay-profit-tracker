"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";

export function GeocodeAddressesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleGeocode() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/orders/geocode", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        geocoded?: number;
        failed?: number;
        skipped?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not geocode addresses.");
      }
      setMessage(
        `Mapped ${payload.geocoded ?? 0} order(s)` +
          (payload.failed ? `, ${payload.failed} failed` : "") +
          ".",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not geocode addresses.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading}
        onClick={() => void handleGeocode()}
      >
        <MapPin className="size-4" />
        {loading ? "Mapping addresses…" : "Map pending addresses"}
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}
