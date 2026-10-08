import { NextResponse } from "next/server";

import { clearQuickbooksConnection } from "@/lib/quickbooks/token-store";

export async function POST() {
  await clearQuickbooksConnection();
  return NextResponse.json({ ok: true });
}
