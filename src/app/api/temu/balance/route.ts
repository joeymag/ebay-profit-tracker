import { NextResponse } from "next/server";

import { TEMU_BALANCE_UNAVAILABLE } from "@/lib/temu/balance";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

export async function GET() {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONNECTED",
        error: "Temu is not connected. Add the seller keys in Settings first.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: false,
    code: "UNAVAILABLE",
    error: TEMU_BALANCE_UNAVAILABLE,
  });
}
