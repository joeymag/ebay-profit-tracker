import { NextResponse } from "next/server";

import { getLastOrderSyncCompletedAt } from "@/lib/shopify/sync-state";

export async function GET() {
  const lastSyncAt = await getLastOrderSyncCompletedAt();
  const autoSyncEnabled = Boolean(process.env.CRON_SECRET?.trim());

  return NextResponse.json({
    ok: true,
    autoSyncEnabled,
    schedule: "Every 15 minutes (Vercel cron)",
    lastSyncAt,
  });
}
