import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  hasSupabaseServiceRoleKey,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import {
  normalizeEbayPrivateKeyToPem,
  normalizeEbaySigningMaterial,
} from "@/lib/ebay/normalize-signing-key";

const TOKEN_ROW_ID = "default";

export type EbaySigningKeyMaterial = {
  privateKey: string;
  jwe: string;
  signingKeyId?: string | null;
};

function normalizePem(value: string): string {
  return normalizeEbayPrivateKeyToPem(value);
}

function readFromEnv(): EbaySigningKeyMaterial | null {
  const privateKey = process.env.EBAY_SIGNING_PRIVATE_KEY?.trim();
  const jwe = process.env.EBAY_SIGNING_JWE?.trim();

  if (!privateKey || !jwe) {
    return null;
  }

  return {
    privateKey: normalizePem(privateKey),
    jwe,
    signingKeyId: process.env.EBAY_SIGNING_KEY_ID?.trim() || null,
  };
}

async function readFromSupabase(): Promise<EbaySigningKeyMaterial | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("ebay_oauth")
      .select("signing_private_key, signing_jwe, signing_key_id")
      .eq("id", TOKEN_ROW_ID)
      .maybeSingle();

    if (error || !data?.signing_private_key || !data?.signing_jwe) {
      return null;
    }

    return {
      privateKey: normalizePem(data.signing_private_key),
      jwe: data.signing_jwe,
      signingKeyId: data.signing_key_id,
    };
  } catch {
    return null;
  }
}

export async function getStoredEbaySigningKey(): Promise<EbaySigningKeyMaterial | null> {
  const fromEnv = readFromEnv();
  if (fromEnv) {
    return fromEnv;
  }

  return readFromSupabase();
}

export async function hasEbaySigningKey(): Promise<boolean> {
  return Boolean(await getStoredEbaySigningKey());
}

export async function saveEbaySigningKey(material: EbaySigningKeyMaterial): Promise<void> {
  if (!isSupabaseConfigured() || !hasSupabaseServiceRoleKey()) {
    throw new Error(
      process.env.VERCEL
        ? "Add SUPABASE_SERVICE_ROLE_KEY to Vercel to store the eBay signing key."
        : "Add SUPABASE_SERVICE_ROLE_KEY to .env.local to store the eBay signing key.",
    );
  }

  const supabase = createSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from("ebay_oauth")
    .select("refresh_token")
    .eq("id", TOKEN_ROW_ID)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not read eBay OAuth row: ${readError.message}`);
  }

  if (!existing?.refresh_token) {
    throw new Error(
      "Connect your eBay account first, then generate a signing key.",
    );
  }

  const { error } = await supabase
    .from("ebay_oauth")
    .update({
      signing_private_key: normalizeEbayPrivateKeyToPem(material.privateKey),
      signing_jwe: material.jwe,
      signing_key_id: material.signingKeyId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", TOKEN_ROW_ID);

  if (error) {
    throw new Error(`Could not store eBay signing key: ${error.message}`);
  }
}
