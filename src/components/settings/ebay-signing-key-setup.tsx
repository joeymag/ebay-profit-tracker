"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SigningKeyResult =
  | {
      ok: true;
      message: string;
      signingKeyId?: string | null;
      alreadyConfigured?: boolean;
    }
  | { ok: false; error: string };

export function EbaySigningKeySetup() {
  const router = useRouter();
  const [hasSigningKey, setHasSigningKey] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ebay/signing-key");
      const data = (await res.json()) as { hasSigningKey?: boolean };
      setHasSigningKey(Boolean(data.hasSigningKey));
    } catch {
      setHasSigningKey(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function createSigningKey() {
    setCreating(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/ebay/signing-key", { method: "POST" });
      const data = (await res.json()) as SigningKeyResult;

      if (!data.ok) {
        setError(data.error || "Could not create signing key.");
        return;
      }

      setHasSigningKey(true);
      setMessage(data.message);
      router.refresh();
      window.dispatchEvent(new CustomEvent("ebay-status-changed"));
    } catch {
      setError("Could not reach the signing key endpoint.");
    } finally {
      setCreating(false);
    }
  }

  async function regenerateSigningKey() {
    setCreating(true);
    setMessage(null);
    setError(null);

    try {
      const clearRes = await fetch("/api/ebay/signing-key", { method: "DELETE" });
      const clearData = (await clearRes.json()) as SigningKeyResult;
      if (!clearData.ok) {
        setError(clearData.error || "Could not clear the old signing key.");
        return;
      }

      await createSigningKey();
    } catch {
      setError("Could not regenerate the signing key.");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking signing key…
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <p className="text-sm font-medium">Digital signature key</p>
        <p className="text-sm text-muted-foreground">
          The Finances API requires a signing key (EU/UK regulatory requirement).
          Generate once after connecting eBay — the private key is stored in
          Supabase and never shown again. If fee sync fails with a signature
          error, regenerate the key here.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={hasSigningKey ? "default" : "secondary"}>
          {hasSigningKey ? "Signing key configured" : "Signing key missing"}
        </Badge>
        {!hasSigningKey ? (
          <Button
            onClick={() => void createSigningKey()}
            disabled={creating}
            type="button"
            variant="secondary"
          >
            {creating ? (
              <>
                <Loader2 className="animate-spin" />
                Generating…
              </>
            ) : (
              "Generate signing key"
            )}
          </Button>
        ) : (
          <Button
            onClick={() => void regenerateSigningKey()}
            disabled={creating}
            type="button"
            variant="outline"
          >
            {creating ? (
              <>
                <Loader2 className="animate-spin" />
                Regenerating…
              </>
            ) : (
              "Regenerate signing key"
            )}
          </Button>
        )}
      </div>

      {message ? (
        <Badge variant="secondary" className="font-normal">
          {message}
        </Badge>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
