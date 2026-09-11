import { NextResponse } from "next/server";

import { connectAmazonWithRefreshToken } from "@/lib/amazon/auth";
import { getAmazonConfig } from "@/lib/amazon/config";

export async function POST(request: Request) {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Add AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET to .env.local (or Vercel), then try again.",
      },
      { status: 400 },
    );
  }

  let body: { refreshToken?: string };
  try {
    body = (await request.json()) as { refreshToken?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected JSON body with refreshToken." },
      { status: 400 },
    );
  }

  const refreshToken = body.refreshToken?.trim();
  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, error: "refreshToken is required." },
      { status: 400 },
    );
  }

  try {
    await connectAmazonWithRefreshToken(refreshToken);
    return NextResponse.json({ ok: true, message: "Amazon account connected." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not connect Amazon.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
