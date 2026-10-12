import { NextResponse } from "next/server";

import { getTemuAccessTokenInfo } from "@/lib/temu/client";
import { saveTemuCredentials } from "@/lib/temu/token-store";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

export async function POST() {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) {
    return NextResponse.json(
      { ok: false, error: "Temu is not connected yet." },
      { status: 400 },
    );
  }

  try {
    const info = await getTemuAccessTokenInfo(credentials);
    if (info.mallId && info.mallId !== credentials.mallId) {
      await saveTemuCredentials({ ...credentials, mallId: info.mallId });
    }
    return NextResponse.json({
      ok: true,
      message: info.mallId
        ? `Temu accepted the keys. Shop id ${info.mallId}.`
        : "Temu accepted the keys.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Temu connection failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
