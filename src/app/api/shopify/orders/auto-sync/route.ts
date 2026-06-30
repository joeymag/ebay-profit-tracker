import { NextResponse } from "next/server";

import { getAutoSyncStatus } from "@/lib/shopify/auto-sync-status";

export async function GET() {
  const status = await getAutoSyncStatus();

  return NextResponse.json({
    ok: true,
    ...status,
  });
}
