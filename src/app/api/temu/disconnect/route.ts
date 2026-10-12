import { NextResponse } from "next/server";

import { clearStoredTemuCredentials } from "@/lib/temu/token-store";

export async function POST() {
  await clearStoredTemuCredentials();
  return NextResponse.json({ ok: true });
}
