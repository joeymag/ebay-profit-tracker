import { NextResponse } from "next/server";

import { TemuApiError } from "@/lib/temu/client";
import { listTemuAccountPayments } from "@/lib/temu/account-payments";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

export const maxDuration = 60;

export async function GET() {
  if (!(await getStoredTemuCredentials())) {
    return NextResponse.json(
      {
        ok: false,
        error: "Temu is not connected. Add the seller keys in Settings first.",
      },
      { status: 400 },
    );
  }

  try {
    const { payments, warning } = await listTemuAccountPayments(30);
    return NextResponse.json({ ok: true, payments, warning });
  } catch (error) {
    const message =
      error instanceof TemuApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load Temu payments.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
