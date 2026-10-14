import { NextResponse } from "next/server";

import { TemuApiError } from "@/lib/temu/client";
import { getTemuBalance } from "@/lib/temu/balance";
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

  try {
    const summary = await getTemuBalance(credentials);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message =
      error instanceof TemuApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load the Temu balance.";
    const status = error instanceof TemuApiError ? 502 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
