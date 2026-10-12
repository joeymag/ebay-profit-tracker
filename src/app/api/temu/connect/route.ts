import { NextResponse } from "next/server";

import { getTemuAccessTokenInfo } from "@/lib/temu/client";
import { parseTemuRegion } from "@/lib/temu/config";
import { saveTemuCredentials } from "@/lib/temu/token-store";

export async function POST(request: Request) {
  let body: {
    appKey?: string;
    appSecret?: string;
    accessToken?: string;
    region?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected JSON with the Temu app key, secret, and access token." },
      { status: 400 },
    );
  }

  const appKey = body.appKey?.trim();
  const appSecret = body.appSecret?.trim();
  const accessToken = body.accessToken?.trim();
  if (!appKey || !appSecret || !accessToken) {
    return NextResponse.json(
      { ok: false, error: "App key, app secret, and access token are all required." },
      { status: 400 },
    );
  }

  const credentials = {
    appKey,
    appSecret,
    accessToken,
    region: parseTemuRegion(body.region),
    mallId: null as string | null,
  };

  try {
    const info = await getTemuAccessTokenInfo(credentials);
    credentials.mallId = info.mallId;
    await saveTemuCredentials(credentials);
    return NextResponse.json({
      ok: true,
      message: info.mallId
        ? `Temu connected. Shop id ${info.mallId}.`
        : "Temu connected.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect Temu.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
