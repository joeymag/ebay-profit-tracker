import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Default lock TTL — long enough for one suggest + PATCH + pauses. */
export const STANDARD_REPRICE_LOCK_TTL_MS = 120_000;

/** Process-local guard (same isolate / warm lambda). */
const localLocks = new Set<string>();

function lockKey(sku: string): string {
  return sku.trim();
}

/**
 * Try to acquire an exclusive Standard-channel reprice lock for a SKU.
 * Uses in-memory Set plus Supabase so buybox-check and amazon-reprice
 * invocations cannot PATCH the same SKU concurrently.
 *
 * Returns false if another holder owns a non-expired lock.
 * If Supabase is unavailable, falls back to local-only (best-effort).
 */
export async function tryAcquireStandardRepriceLock(
  sku: string,
  holder: string,
  ttlMs: number = STANDARD_REPRICE_LOCK_TTL_MS,
): Promise<boolean> {
  const key = lockKey(sku);
  if (!key) return false;

  if (localLocks.has(key)) {
    return false;
  }
  localLocks.add(key);

  if (!isSupabaseConfigured()) {
    return true;
  }

  try {
    const supabase = createSupabaseAdmin();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlMs).toISOString();

    const { error: insertError } = await supabase
      .from("amazon_reprice_sku_locks")
      .insert({
        sku: key,
        holder,
        locked_at: nowIso,
        expires_at: expiresAt,
      });

    if (!insertError) {
      return true;
    }

    const patch = {
      holder,
      locked_at: nowIso,
      expires_at: expiresAt,
    };

    // Conflict: take over if expired…
    const { data: stolen, error: stealError } = await supabase
      .from("amazon_reprice_sku_locks")
      .update(patch)
      .eq("sku", key)
      .lt("expires_at", nowIso)
      .select("sku")
      .maybeSingle();

    if (stealError) {
      console.warn(
        "[sku-lock] steal failed, using local lock only:",
        stealError.message,
      );
      return true;
    }
    if (stolen) return true;

    // …or renew if we already hold it.
    const { data: renewed, error: renewError } = await supabase
      .from("amazon_reprice_sku_locks")
      .update(patch)
      .eq("sku", key)
      .eq("holder", holder)
      .select("sku")
      .maybeSingle();

    if (renewError) {
      console.warn(
        "[sku-lock] renew failed, using local lock only:",
        renewError.message,
      );
      return true;
    }
    if (!renewed) {
      localLocks.delete(key);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      "[sku-lock] acquire error, using local lock only:",
      error instanceof Error ? error.message : error,
    );
    return true;
  }
}

export async function releaseStandardRepriceLock(
  sku: string,
  holder: string,
): Promise<void> {
  const key = lockKey(sku);
  if (!key) return;
  localLocks.delete(key);

  if (!isSupabaseConfigured()) return;

  try {
    const supabase = createSupabaseAdmin();
    await supabase
      .from("amazon_reprice_sku_locks")
      .delete()
      .eq("sku", key)
      .eq("holder", holder);
  } catch {
    // Expiry handles abandoned locks.
  }
}

/**
 * Run `fn` while holding the Standard SKU lock.
 * If the lock cannot be acquired, returns `{ acquired: false }`.
 */
export async function withStandardRepriceLock<T>(input: {
  sku: string;
  holder: string;
  ttlMs?: number;
  fn: () => Promise<T>;
}): Promise<
  | { acquired: true; value: T }
  | { acquired: false; reason: string }
> {
  const got = await tryAcquireStandardRepriceLock(
    input.sku,
    input.holder,
    input.ttlMs,
  );
  if (!got) {
    return {
      acquired: false,
      reason: "Skipped: Standard reprice lock held by another job.",
    };
  }
  try {
    const value = await input.fn();
    return { acquired: true, value };
  } finally {
    await releaseStandardRepriceLock(input.sku, input.holder);
  }
}
