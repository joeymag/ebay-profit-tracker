import { after, NextResponse } from "next/server";

import { getAmazonConfig } from "@/lib/amazon/config";
import { runAmazonAutoReprice } from "@/lib/amazon/repricer";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 300;

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Amazon is not configured." },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredAmazonRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, error: "Amazon is not connected." },
      { status: 400 },
    );
  }

  after(async () => {
    try {
      const result = await runAmazonAutoReprice();
      console.info(
        "[cron/amazon-reprice] completed",
        JSON.stringify({
          checked: result.checked,
          applied: result.applied,
          skipped: result.skipped,
          failed: result.failed,
        }),
      );
      for (const row of result.results) {
        if (row.status === "applied" || row.status === "failed") {
          console.info(
            "[cron/amazon-reprice]",
            row.status,
            row.sku,
            row.reason,
            row.fromPrice,
            "->",
            row.toPrice,
          );
        }
      }
    } catch (error) {
      console.error(
        "[cron/amazon-reprice] failed:",
        error instanceof Error ? error.message : error,
      );
    }
  });

  return NextResponse.json({
    ok: true,
    status: "started",
    message:
      "Amazon auto-reprice started. Call every 15–30 minutes with Authorization: Bearer CRON_SECRET.",
  });
}
