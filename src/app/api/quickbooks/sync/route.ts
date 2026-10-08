import { NextResponse } from "next/server";

import { QuickbooksApiError } from "@/lib/quickbooks/errors";
import { syncQuickbooksTransactions } from "@/lib/quickbooks/sync-transactions";

export const maxDuration = 60;

export async function POST(request: Request) {
  let days = 90;
  try {
    const body = (await request.json()) as { days?: number };
    if (typeof body.days === "number" && Number.isFinite(body.days)) {
      days = body.days;
    }
  } catch {
    days = 90;
  }

  try {
    const result = await syncQuickbooksTransactions({ days });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QuickbooksApiError) {
      const needsReconnect = error.status === 401 || error.status === 403;
      return NextResponse.json(
        {
          ok: false,
          error: needsReconnect
            ? "QuickBooks access expired. Reconnect the company."
            : error.message,
          details: error.body?.slice(0, 400),
        },
        { status: needsReconnect ? 401 : 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Could not sync QuickBooks.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
