import { NextResponse } from "next/server";

import { createEbaySigningKey } from "@/lib/ebay/create-signing-key";
import { getEbayConfig } from "@/lib/ebay/config";
import {
  hasEbaySigningKey,
  saveEbaySigningKey,
} from "@/lib/ebay/signing-key-store";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasSigningKey: await hasEbaySigningKey(),
  });
}

export async function POST() {
  const config = getEbayConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "eBay is not configured." },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredEbayRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Connect your eBay account first, then generate a signing key.",
      },
      { status: 400 },
    );
  }

  if (await hasEbaySigningKey()) {
    return NextResponse.json({
      ok: true,
      alreadyConfigured: true,
      message: "eBay signing key is already configured.",
    });
  }

  try {
    const material = await createEbaySigningKey();
    await saveEbaySigningKey(material);

    return NextResponse.json({
      ok: true,
      signingKeyId: material.signingKeyId ?? null,
      message:
        "Signing key created and saved. You can now sync eBay fees from the Finances API.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create eBay signing key";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
