import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  hasSupabaseServiceRoleKey,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

const TOKEN_ROW_ID = "default";

export type StoredQuickbooksConnection = {
  realmId: string;
  refreshToken: string;
  accessToken: string | null;
  accessExpiresAt: string | null;
  companyName: string | null;
  updatedAt: string;
};

export async function getStoredQuickbooksConnection(): Promise<StoredQuickbooksConnection | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("quickbooks_oauth")
    .select(
      "realm_id, refresh_token, access_token, access_expires_at, company_name, updated_at",
    )
    .eq("id", TOKEN_ROW_ID)
    .maybeSingle();

  if (error || !data?.refresh_token || !data.realm_id) {
    return null;
  }

  return {
    realmId: data.realm_id,
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    accessExpiresAt: data.access_expires_at,
    companyName: data.company_name,
    updatedAt: data.updated_at,
  };
}

export async function saveQuickbooksConnection(input: {
  realmId: string;
  refreshToken: string;
  accessToken: string;
  accessExpiresAt: string;
  companyName?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured() || !hasSupabaseServiceRoleKey()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to save the QuickBooks connection.",
    );
  }

  const existing = await getStoredQuickbooksConnection();
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("quickbooks_oauth").upsert(
    {
      id: TOKEN_ROW_ID,
      realm_id: input.realmId,
      refresh_token: input.refreshToken,
      access_token: input.accessToken,
      access_expires_at: input.accessExpiresAt,
      company_name: input.companyName ?? existing?.companyName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateQuickbooksCompanyName(
  companyName: string,
): Promise<void> {
  if (!isSupabaseConfigured() || !hasSupabaseServiceRoleKey()) {
    return;
  }

  const supabase = createSupabaseAdmin();
  await supabase
    .from("quickbooks_oauth")
    .update({
      company_name: companyName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", TOKEN_ROW_ID);
}

export async function clearQuickbooksConnection(): Promise<void> {
  if (!isSupabaseConfigured() || !hasSupabaseServiceRoleKey()) {
    return;
  }

  const supabase = createSupabaseAdmin();
  await supabase.from("quickbooks_oauth").delete().eq("id", TOKEN_ROW_ID);
}
