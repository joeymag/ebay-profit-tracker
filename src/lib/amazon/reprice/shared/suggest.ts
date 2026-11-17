import type {
  AmazonCompetitiveSnapshot,
  AmazonRepriceChannel,
  AmazonRepriceRule,
} from "@/lib/amazon/reprice/shared/types";
import { defaultUndercutForChannel } from "@/lib/amazon/reprice/shared/types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPrice(
  value: number,
  minPrice: number | null,
  maxPrice: number | null,
): number {
  let next = value;
  if (minPrice != null) next = Math.max(next, minPrice);
  if (maxPrice != null) next = Math.min(next, maxPrice);
  return roundMoney(next);
}

function parseEnvNumber(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Global Standard mid-gap defaults (env), else 0. */
export function getGlobalStandardGapOffsets(): {
  amount: number;
  percent: number;
} {
  return {
    amount: parseEnvNumber("AMAZON_STANDARD_GAP_OFFSET_AMOUNT") ?? 0,
    percent: parseEnvNumber("AMAZON_STANDARD_GAP_OFFSET_PERCENT") ?? 0,
  };
}

export function resolveStandardGapOffsets(input: {
  rule: AmazonRepriceRule | null;
  /** Call-site override (wins over rule + global). */
  gapOffsetAmount?: number | null;
  gapOffsetPercent?: number | null;
}): { amount: number; percent: number } {
  const global = getGlobalStandardGapOffsets();
  const amount =
    input.gapOffsetAmount != null && Number.isFinite(input.gapOffsetAmount)
      ? Number(input.gapOffsetAmount)
      : input.rule?.gapOffsetAmount != null &&
          Number.isFinite(input.rule.gapOffsetAmount)
        ? Number(input.rule.gapOffsetAmount)
        : global.amount;
  const percent =
    input.gapOffsetPercent != null && Number.isFinite(input.gapOffsetPercent)
      ? Number(input.gapOffsetPercent)
      : input.rule?.gapOffsetPercent != null &&
          Number.isFinite(input.rule.gapOffsetPercent)
        ? Number(input.rule.gapOffsetPercent)
        : global.percent;
  return { amount, percent };
}

/**
 * Midpoint between our price and the Buy Box, plus optional fixed £ / % of gap.
 * Positive offset = higher price (more margin); negative = more aggressive.
 */
export function computeStandardMidGapTarget(input: {
  currentPrice: number;
  buyBoxPrice: number;
  gapOffsetAmount?: number;
  gapOffsetPercent?: number;
}): { target: number; mid: number; amount: number; percent: number } {
  const amount = Number(input.gapOffsetAmount ?? 0);
  const percent = Number(input.gapOffsetPercent ?? 0);
  const mid = (input.currentPrice + input.buyBoxPrice) / 2;
  const gap = input.buyBoxPrice - input.currentPrice;
  const target = mid + amount + gap * percent;
  return { target, mid, amount, percent };
}

function offsetsAreSet(amount: number, percent: number): boolean {
  return Math.abs(amount) > 1e-9 || Math.abs(percent) > 1e-9;
}

export function computeSuggestedPrice(input: {
  currentPrice: number | null;
  competitive: AmazonCompetitiveSnapshot | null;
  rule: AmazonRepriceRule | null;
  channel?: AmazonRepriceChannel;
  emptyCompetitiveReason?: string;
  /** Override Standard mid-gap fixed £ offset for this call. */
  gapOffsetAmount?: number | null;
  /** Override Standard mid-gap % of gap for this call. */
  gapOffsetPercent?: number | null;
}): { suggestedPrice: number | null; reason: string } {
  const rule = input.rule;
  if (!rule || !rule.enabled) {
    return { suggestedPrice: null, reason: "No active reprice rule." };
  }
  if (rule.strategy === "manual") {
    return { suggestedPrice: null, reason: "Manual strategy — set price yourself." };
  }

  const competitive = input.competitive;
  if (!competitive) {
    return {
      suggestedPrice: null,
      reason:
        input.emptyCompetitiveReason ??
        (input.channel === "business"
          ? "No Business competitive data."
          : "No competitive data."),
    };
  }

  const channel = input.channel ?? rule.channel ?? "standard";
  const undercut =
    rule.undercutAmount > 0
      ? rule.undercutAmount
      : defaultUndercutForChannel(channel);
  let target: number | null = null;
  let reason = "";
  /** When set, clamp must still allow beating (undercut) or matching this Buy Box. */
  let requireBeatBuyBox: number | null = null;
  let requireMatchBuyBox: number | null = null;
  let usedMidGap = false;

  if (rule.strategy === "undercut_buybox") {
    if (competitive.youHaveBuyBox) {
      return { suggestedPrice: null, reason: "You already hold the Buy Box." };
    }
    if (competitive.buyBoxPrice == null) {
      return { suggestedPrice: null, reason: "No Buy Box price to beat." };
    }
    const offsets = resolveStandardGapOffsets({
      rule,
      gapOffsetAmount: input.gapOffsetAmount,
      gapOffsetPercent: input.gapOffsetPercent,
    });
    if (
      channel === "standard" &&
      offsetsAreSet(offsets.amount, offsets.percent) &&
      input.currentPrice != null &&
      Number.isFinite(input.currentPrice)
    ) {
      const midGap = computeStandardMidGapTarget({
        currentPrice: input.currentPrice,
        buyBoxPrice: competitive.buyBoxPrice,
        gapOffsetAmount: offsets.amount,
        gapOffsetPercent: offsets.percent,
      });
      target = midGap.target;
      usedMidGap = true;
      reason = `Mid-gap Buy Box (£${competitive.buyBoxPrice.toFixed(2)}; mid £${midGap.mid.toFixed(2)}; offset £${offsets.amount.toFixed(2)} / ${(offsets.percent * 100).toFixed(0)}%)`;
    } else {
      target = competitive.buyBoxPrice - undercut;
      requireBeatBuyBox = competitive.buyBoxPrice;
      reason = `Beat Buy Box (£${competitive.buyBoxPrice.toFixed(2)}) by £${undercut.toFixed(2)}`;
    }
  } else if (rule.strategy === "match_buybox") {
    target = competitive.buyBoxPrice;
    requireMatchBuyBox = competitive.buyBoxPrice;
    reason = target != null ? `Match Buy Box (£${target.toFixed(2)})` : "No Buy Box price.";
  } else if (rule.strategy === "match_lowest") {
    target = competitive.lowestPrice;
    reason =
      target != null ? `Match lowest offer (£${target.toFixed(2)})` : "No lowest offer.";
  } else {
    if (competitive.lowestPrice == null) {
      return { suggestedPrice: null, reason: "No lowest offer to undercut." };
    }
    if (competitive.youHaveBuyBox && competitive.yourOfferPrice != null) {
      const lowestOther =
        competitive.lowestPrice < competitive.yourOfferPrice - 0.001
          ? competitive.lowestPrice
          : null;
      if (lowestOther == null) {
        return {
          suggestedPrice: null,
          reason: "You already hold Buy Box at the lowest price.",
        };
      }
      target = lowestOther - undercut;
      reason = `Undercut next offer (£${lowestOther.toFixed(2)}) by £${undercut.toFixed(2)}`;
    } else {
      target = competitive.lowestPrice - undercut;
      reason = `Undercut lowest (£${competitive.lowestPrice.toFixed(2)}) by £${undercut.toFixed(2)}`;
    }
  }

  if (target == null) {
    return { suggestedPrice: null, reason };
  }

  const suggested = clampPrice(target, rule.minPrice, rule.maxPrice);
  if (rule.minPrice != null && target < rule.minPrice) {
    reason += ` · floored at min £${rule.minPrice.toFixed(2)}`;
  }
  if (rule.maxPrice != null && target > rule.maxPrice) {
    reason += ` · capped at max £${rule.maxPrice.toFixed(2)}`;
  }

  // After min/max clamp: skip PATCHes that cannot achieve beat/match goals.
  // Mid-gap intentionally sits between our price and Buy Box — not subject to beat check.
  if (!usedMidGap && requireBeatBuyBox != null && suggested >= requireBeatBuyBox - 0.001) {
    return {
      suggestedPrice: null,
      reason: `${reason} · skipped: min/max leaves £${suggested.toFixed(2)} which cannot beat Buy Box £${requireBeatBuyBox.toFixed(2)}.`,
    };
  }
  if (
    requireMatchBuyBox != null &&
    Math.abs(suggested - requireMatchBuyBox) >= 0.005
  ) {
    return {
      suggestedPrice: null,
      reason: `${reason} · skipped: min/max leaves £${suggested.toFixed(2)} which cannot match Buy Box £${requireMatchBuyBox.toFixed(2)}.`,
    };
  }

  if (
    input.currentPrice != null &&
    Math.abs(suggested - input.currentPrice) < 0.005
  ) {
    return { suggestedPrice: null, reason: "Already at suggested price." };
  }

  return { suggestedPrice: suggested, reason };
}

export { roundMoney };
