import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Last successful Shopify order sync time (from sync_runs). */
export async function getLastOrderSyncCompletedAt(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("sync_runs")
      .select("completed_at")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return null;
    }

    return data?.completed_at ?? null;
  } catch {
    return null;
  }
}
