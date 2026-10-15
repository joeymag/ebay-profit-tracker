import { DEFAULT_EBAY_DESCRIPTION_TEMPLATE } from "@/lib/ebay/apply-description-template";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const TEMPLATE_ID = "default";

export { DEFAULT_EBAY_DESCRIPTION_TEMPLATE };

export async function getEbayDescriptionTemplate(): Promise<string> {
  if (!isSupabaseConfigured()) return DEFAULT_EBAY_DESCRIPTION_TEMPLATE;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("ebay_description_template")
    .select("html")
    .eq("id", TEMPLATE_ID)
    .maybeSingle();
  if (error || !data?.html?.trim()) return DEFAULT_EBAY_DESCRIPTION_TEMPLATE;
  return data.html
    .replace(/max-width:\s*1100px/gi, "max-width:none")
    .replace(/max-width:\s*260px/gi, "max-width:100%");
}

export async function saveEbayDescriptionTemplate(html: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is required to save the description template.");
  }
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("ebay_description_template").upsert(
    {
      id: TEMPLATE_ID,
      html,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    throw new Error(error.message);
  }
}
