import { parseQuantityDiscountPlan } from "@/lib/amazon/reprice/shared/quantity-plan";
import { quantityDiscountPlanToJson } from "@/lib/amazon/reprice/shared/quantity-plan";
import { roundMoney } from "@/lib/amazon/reprice/shared/suggest";
import type {
  AmazonRepriceChannel,
  AmazonRepriceEvent,
  AmazonRepriceRule,
  QuantityDiscountPlan,
  RepriceStrategy,
} from "@/lib/amazon/reprice/shared/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const DEFAULT_UNDERCUT = 0.01;

function mapRuleRow(row: {
  sku: string;
  channel?: string | null;
  enabled: boolean;
  strategy: string;
  min_price: number | null;
  max_price: number | null;
  undercut_amount: number | null;
  gap_offset_amount?: number | null;
  gap_offset_percent?: number | null;
  quantity_discount_plan?: unknown;
  updated_at: string;
}): AmazonRepriceRule {
  return {
    sku: row.sku,
    channel: row.channel === "business" ? "business" : "standard",
    enabled: row.enabled,
    strategy: row.strategy as RepriceStrategy,
    minPrice: row.min_price == null ? null : Number(row.min_price),
    maxPrice: row.max_price == null ? null : Number(row.max_price),
    undercutAmount: Number(row.undercut_amount ?? DEFAULT_UNDERCUT),
    gapOffsetAmount: Number(row.gap_offset_amount ?? 0),
    gapOffsetPercent: Number(row.gap_offset_percent ?? 0),
    quantityDiscountPlan: parseQuantityDiscountPlan(row.quantity_discount_plan),
    updatedAt: row.updated_at,
  };
}

export async function listRepriceRulesForChannel(
  channel: AmazonRepriceChannel,
): Promise<AmazonRepriceRule[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("amazon_reprice_rules")
      .select("*")
      .eq("channel", channel)
      .order("sku");
    if (error || !data) return [];
    return data.map(mapRuleRow);
  } catch {
    return [];
  }
}

export async function upsertRepriceRuleForChannel(
  channel: AmazonRepriceChannel,
  input: {
    sku: string;
    enabled: boolean;
    strategy: RepriceStrategy;
    minPrice: number | null;
    maxPrice: number | null;
    undercutAmount: number;
    gapOffsetAmount?: number;
    gapOffsetPercent?: number;
    quantityDiscountPlan?: QuantityDiscountPlan | null;
  },
): Promise<AmazonRepriceRule> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is required to save reprice rules.");
  }
  const planJson =
    channel === "business"
      ? quantityDiscountPlanToJson(input.quantityDiscountPlan ?? null)
      : null;

  const supabase = createSupabaseAdmin();
  const payload = {
    sku: input.sku.trim(),
    channel,
    enabled: input.enabled,
    strategy: input.strategy,
    min_price: input.minPrice,
    max_price: input.maxPrice,
    undercut_amount: input.undercutAmount,
    gap_offset_amount: input.gapOffsetAmount ?? 0,
    gap_offset_percent: input.gapOffsetPercent ?? 0,
    quantity_discount_plan: planJson,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("amazon_reprice_rules")
    .upsert(payload, { onConflict: "sku,channel" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to save reprice rule.");
  }
  return mapRuleRow(data);
}

export async function logRepriceEventForChannel(input: {
  sku: string;
  channel: AmazonRepriceChannel;
  fromPrice?: number | null;
  toPrice: number;
  source?: string;
  reason?: string | null;
  status?: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createSupabaseAdmin();
    await supabase.from("amazon_reprice_events").insert({
      sku: input.sku.trim(),
      channel: input.channel,
      from_price: input.fromPrice ?? null,
      to_price: roundMoney(input.toPrice),
      source: input.source ?? "manual",
      reason: input.reason ?? null,
      status: input.status ?? "applied",
    });
  } catch {
    // History logging should never block price updates.
  }
}

export async function listRepriceEventsForChannel(options: {
  channel: AmazonRepriceChannel;
  days?: number;
  limit?: number;
  sku?: string;
}): Promise<AmazonRepriceEvent[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const days = options.days ?? 7;
    const limit = options.limit ?? 100;
    const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
    const supabase = createSupabaseAdmin();
    let query = supabase
      .from("amazon_reprice_events")
      .select("*")
      .eq("channel", options.channel)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (options.sku?.trim()) {
      query = query.eq("sku", options.sku.trim());
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((row) => ({
      id: Number(row.id),
      sku: row.sku,
      channel: row.channel === "business" ? "business" : "standard",
      fromPrice: row.from_price == null ? null : Number(row.from_price),
      toPrice: Number(row.to_price),
      source: row.source,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}
