import { NextResponse } from "next/server";

import { createEbaySigningKey } from "@/lib/ebay/create-signing-key";
import { getEbayConfig } from "@/lib/ebay/config";
import {
  hasEbaySigningKey,
  saveEbaySigningKey,
} from "@/lib/ebay/signing-key-store";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  hasSupabaseServiceRoleKey,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

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

export async function DELETE() {
  if (!isSupabaseConfigured() || !hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Cannot clear signing key without SUPABASE_SERVICE_ROLE_KEY configured.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("ebay_oauth")
    .update({
      signing_private_key: null,
      signing_jwe: null,
      signing_key_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Signing key cleared. Generate a new one, then sync fees again.",
  });
}
