import { getLastOrderSyncCompletedAt } from "@/lib/shopify/sync-state";

export type AutoSyncStatus = {
  autoSyncEnabled: boolean;
  schedule: string;
  lastSyncAt: string | null;
};

export async function getAutoSyncStatus(): Promise<AutoSyncStatus> {
  const lastSyncAt = await getLastOrderSyncCompletedAt();

  return {
    autoSyncEnabled: Boolean(process.env.CRON_SECRET?.trim()),
    schedule:
      "Every 15 minutes via external cron (e.g. cron-job.org) calling /api/cron/sync-orders",
    lastSyncAt,
  };
}
