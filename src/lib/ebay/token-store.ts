import fs from "fs/promises";
import path from "path";

import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  hasSupabaseServiceRoleKey,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

const TOKEN_ROW_ID = "default";
const TOKEN_FILE = path.join(process.cwd(), "data", "ebay-oauth.json");

type StoredEbayTokens = {
  refreshToken: string;
  updatedAt: string;
};

async function readTokenFromFile(): Promise<string | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredEbayTokens;
    return parsed.refreshToken?.trim() || null;
  } catch {
    return null;
  }
}

async function readTokenFromSupabase(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("ebay_oauth")
      .select("refresh_token")
      .eq("id", TOKEN_ROW_ID)
      .maybeSingle();

    if (error) {
      return null;
    }

    return data?.refresh_token?.trim() || null;
  } catch {
    return null;
  }
}

async function writeTokenToSupabase(refreshToken: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  if (!hasSupabaseServiceRoleKey()) {
    console.error(
      "Cannot save eBay token: SUPABASE_SERVICE_ROLE_KEY is missing.",
    );
    return false;
  }

  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("ebay_oauth").upsert(
      {
        id: TOKEN_ROW_ID,
        refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("Failed to save eBay token to Supabase:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Failed to save eBay token to Supabase:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

function canWriteLocalTokenFile(): boolean {
  return !process.env.VERCEL;
}

async function writeTokenToFile(refreshToken: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
    const payload: StoredEbayTokens = {
      refreshToken,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(TOKEN_FILE, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function getStoredEbayRefreshToken(): Promise<string | null> {
  const fromEnv = process.env.EBAY_REFRESH_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const fromSupabase = await readTokenFromSupabase();
  if (fromSupabase) {
    return fromSupabase;
  }

  return readTokenFromFile();
}

export async function saveEbayRefreshToken(refreshToken: string): Promise<void> {
  const savedToSupabase = await writeTokenToSupabase(refreshToken);
  if (savedToSupabase) {
    return;
  }

  if (canWriteLocalTokenFile()) {
    const savedToFile = await writeTokenToFile(refreshToken);
    if (savedToFile) {
      return;
    }
  }

  throw new Error(
    process.env.VERCEL
      ? hasSupabaseServiceRoleKey()
        ? "Could not store eBay refresh token in Supabase. Check Supabase logs and redeploy."
        : "Add SUPABASE_SERVICE_ROLE_KEY to Vercel (Supabase → Settings → API → service_role), then redeploy and connect again."
      : hasSupabaseServiceRoleKey()
        ? "Could not store eBay refresh token in Supabase."
        : "Add SUPABASE_SERVICE_ROLE_KEY to .env.local, or set EBAY_REFRESH_TOKEN manually.",
  );
}

export async function clearStoredEbayRefreshToken(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseAdmin();
      await supabase.from("ebay_oauth").delete().eq("id", TOKEN_ROW_ID);
    } catch {
      // ignore
    }
  }

  try {
    await fs.unlink(TOKEN_FILE);
  } catch {
    // ignore
  }
}
