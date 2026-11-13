export type AmazonRepriceChannel = "standard" | "business";

export function parseRepriceChannel(
  value: unknown,
): AmazonRepriceChannel | null {
  if (value === "standard" || value === "business") return value;
  return null;
}

export function repriceAudience(
  channel: AmazonRepriceChannel,
): "ALL" | "B2B" {
  return channel === "business" ? "B2B" : "ALL";
}

export function repriceCustomerType(
  channel: AmazonRepriceChannel,
): "Consumer" | "Business" {
  return channel === "business" ? "Business" : "Consumer";
}

export type QuantityDiscountLevel = {
  lowerBound: number;
  value: number;
};

export type QuantityDiscountPlan = {
  discountType: "fixed" | "percent";
  levels: QuantityDiscountLevel[];
};

export function parseQuantityDiscountPlan(
  value: unknown,
): QuantityDiscountPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const discountType =
    raw.discountType === "percent" || raw.discount_type === "percent"
      ? "percent"
      : raw.discountType === "fixed" || raw.discount_type === "fixed"
        ? "fixed"
        : null;
  const levelsRaw = Array.isArray(raw.levels) ? raw.levels : null;
  if (!discountType || !levelsRaw) return null;

  const levels: QuantityDiscountLevel[] = [];
  for (const entry of levelsRaw.slice(0, 5)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const lowerBound = Number(row.lowerBound ?? row.lower_bound);
    const amount = Number(row.value);
    if (
      !Number.isFinite(lowerBound) ||
      lowerBound < 1 ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      continue;
    }
    levels.push({
      lowerBound: Math.floor(lowerBound),
      value: Math.round(amount * 100) / 100,
    });
  }
  if (levels.length === 0) return null;
  return { discountType, levels };
}

export function quantityDiscountPlanToJson(
  plan: QuantityDiscountPlan | null | undefined,
): Record<string, unknown> | null {
  if (!plan || plan.levels.length === 0) return null;
  return {
    discount_type: plan.discountType,
    levels: plan.levels.map((level) => ({
      lower_bound: level.lowerBound,
      value: level.value,
    })),
  };
}

export function quantityDiscountPlanToAmazonPatch(
  plan: QuantityDiscountPlan | null | undefined,
): Array<{
  schedule: Array<{
    discount_type: "fixed" | "percent";
    levels: Array<{ lower_bound: number; value: number }>;
  }>;
}> | null {
  if (!plan || plan.levels.length === 0) return null;
  return [
    {
      schedule: [
        {
          discount_type: plan.discountType,
          levels: plan.levels.map((level) => ({
            lower_bound: level.lowerBound,
            value: level.value,
          })),
        },
      ],
    },
  ];
}
