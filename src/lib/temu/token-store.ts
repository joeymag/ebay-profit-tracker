import fs from "fs/promises";
import path from "path";

import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  hasSupabaseServiceRoleKey,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import {
  parseTemuRegion,
  temuCredentialsFromEnv,
  type TemuCredentials,
  type TemuRegion,
} from "@/lib/temu/config";

const TOKEN_ROW_ID = "default";
const TOKEN_FILE = path.join(process.cwd(), "data", "temu-oauth.json");

type StoredTemuCredentials = {
  appKey: string;
  appSecret: string;
  accessToken: string;
  region: TemuRegion;
  mallId: string | null;
  updatedAt: string;
};

function canWriteLocalTokenFile(): boolean {
  return !process.env.VERCEL;
}

async function readFromFile(): Promise<StoredTemuCredentials | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredTemuCredentials;
    if (!parsed.appKey || !parsed.appSecret || !parsed.accessToken) return null;
    return {
      ...parsed,
      region: parseTemuRegion(parsed.region),
      mallId: parsed.mallId?.trim() || null,
    };
  } catch {
    return null;
  }
}

async function readFromSupabase(): Promise<StoredTemuCredentials | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("temu_oauth")
      .select("app_key, app_secret, access_token, region, mall_id")
      .eq("id", TOKEN_ROW_ID)
      .maybeSingle();
    if (error || !data?.app_key || !data.app_secret || !data.access_token) {
      return null;
    }
    return {
      appKey: data.app_key,
      appSecret: data.app_secret,
      accessToken: data.access_token,
      region: parseTemuRegion(data.region),
      mallId: data.mall_id,
      updatedAt: "",
    };
  } catch {
    return null;
  }
}

export async function getStoredTemuCredentials(): Promise<TemuCredentials | null> {
  const fromEnv = temuCredentialsFromEnv();
  if (fromEnv) return fromEnv;
  const fromSupabase = await readFromSupabase();
  if (fromSupabase) return fromSupabase;
  return readFromFile();
}

export async function saveTemuCredentials(
  credentials: TemuCredentials,
): Promise<void> {
  const row = {
    id: TOKEN_ROW_ID,
    app_key: credentials.appKey,
    app_secret: credentials.appSecret,
    access_token: credentials.accessToken,
    region: credentials.region,
    mall_id: credentials.mallId,
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured() && hasSupabaseServiceRoleKey()) {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("temu_oauth").upsert(row, {
      onConflict: "id",
    });
    if (!error) return;
    console.error("Failed to save Temu keys to Supabase:", error.message);
  }

  if (canWriteLocalTokenFile()) {
    await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
    const payload: StoredTemuCredentials = {
      appKey: credentials.appKey,
      appSecret: credentials.appSecret,
      accessToken: credentials.accessToken,
      region: credentials.region,
      mallId: credentials.mallId,
      updatedAt: row.updated_at,
    };
    await fs.writeFile(TOKEN_FILE, JSON.stringify(payload, null, 2), "utf8");
    return;
  }

  throw new Error(
    "Add SUPABASE_SERVICE_ROLE_KEY to Vercel so the Temu keys can be saved.",
  );
}

export async function clearStoredTemuCredentials(): Promise<void> {
  if (isSupabaseConfigured() && hasSupabaseServiceRoleKey()) {
    try {
      const supabase = createSupabaseAdmin();
      await supabase.from("temu_oauth").delete().eq("id", TOKEN_ROW_ID);
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
