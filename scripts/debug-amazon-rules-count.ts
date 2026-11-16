import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  console.log("url", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("hasService", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
  const { isSupabaseConfigured } = await import("../src/lib/supabase/config");
  console.log("configured", isSupabaseConfigured());
  const { createSupabaseAdmin } = await import("../src/lib/supabase/client");
  const sb = createSupabaseAdmin();
  const all = await sb
    .from("amazon_reprice_rules")
    .select("sku,channel,enabled", { count: "exact" })
    .limit(5);
  console.log(
    JSON.stringify(
      { error: all.error, count: all.count, sample: all.data },
      null,
      2,
    ),
  );
  const std = await sb
    .from("amazon_reprice_rules")
    .select("sku", { count: "exact", head: true })
    .eq("channel", "standard");
  const biz = await sb
    .from("amazon_reprice_rules")
    .select("sku", { count: "exact", head: true })
    .eq("channel", "business");
  console.log(
    JSON.stringify(
      {
        standard: { error: std.error, count: std.count },
        business: { error: biz.error, count: biz.count },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
