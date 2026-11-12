/**
 * Amazon Low-price FBA fulfilment fees (UK), per unit.
 * Source: Amazon FBA rate card — Local and Pan-European FBA.
 * Dimensional weight is not used for Low-price FBA shipping weight.
 */

export type LowPriceFbaSizeTierId =
  | "light_envelope"
  | "standard_envelope"
  | "large_envelope"
  | "extra_large_envelope"
  | "small_parcel";

export type LowPriceFbaWeightBand = {
  maxWeightG: number;
  ukGbp: number;
};

export type LowPriceFbaSizeTier = {
  id: LowPriceFbaSizeTierId;
  label: string;
  /** Longest side (cm). */
  maxLongestCm: number;
  /** Median side (cm). */
  maxMedianCm: number;
  /** Shortest side (cm). */
  maxShortestCm: number;
  bands: LowPriceFbaWeightBand[];
};

export const LOW_PRICE_FBA_UK_TIERS: LowPriceFbaSizeTier[] = [
  {
    id: "light_envelope",
    label: "Light envelope",
    maxLongestCm: 33,
    maxMedianCm: 23,
    maxShortestCm: 2.5,
    bands: [
      { maxWeightG: 20, ukGbp: 1.46 },
      { maxWeightG: 40, ukGbp: 1.5 },
      { maxWeightG: 60, ukGbp: 1.52 },
      { maxWeightG: 80, ukGbp: 1.67 },
      { maxWeightG: 100, ukGbp: 1.7 },
    ],
  },
  {
    id: "standard_envelope",
    label: "Standard envelope",
    maxLongestCm: 33,
    maxMedianCm: 23,
    maxShortestCm: 2.5,
    bands: [
      { maxWeightG: 210, ukGbp: 1.73 },
      { maxWeightG: 460, ukGbp: 1.87 },
    ],
  },
  {
    id: "large_envelope",
    label: "Large envelope",
    maxLongestCm: 33,
    maxMedianCm: 23,
    maxShortestCm: 4,
    bands: [{ maxWeightG: 960, ukGbp: 2.42 }],
  },
  {
    id: "extra_large_envelope",
    label: "Extra-large envelope",
    maxLongestCm: 33,
    maxMedianCm: 23,
    maxShortestCm: 6,
    bands: [{ maxWeightG: 960, ukGbp: 2.65 }],
  },
  {
    id: "small_parcel",
    label: "Small parcel",
    maxLongestCm: 35,
    maxMedianCm: 25,
    maxShortestCm: 12,
    bands: [
      { maxWeightG: 150, ukGbp: 2.67 },
      { maxWeightG: 400, ukGbp: 2.7 },
    ],
  },
];

export type LowPriceFbaLookupResult = {
  tierId: LowPriceFbaSizeTierId;
  tierLabel: string;
  maxWeightG: number;
  feeGbp: number;
  longestCm: number;
  medianCm: number;
  shortestCm: number;
  weightG: number;
};

function sortDimensionsCm(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
): [number, number, number] {
  return [lengthCm, widthCm, heightCm].sort((a, b) => b - a) as [
    number,
    number,
    number,
  ];
}

function dimensionsFitTier(
  longestCm: number,
  medianCm: number,
  shortestCm: number,
  tier: LowPriceFbaSizeTier,
): boolean {
  return (
    longestCm <= tier.maxLongestCm &&
    medianCm <= tier.maxMedianCm &&
    shortestCm <= tier.maxShortestCm
  );
}

/**
 * Look up the UK Low-price FBA fulfilment fee for a unit’s weight and package size.
 * Returns null when the item is outside the Low-price FBA UK table we have.
 */
export function lookupLowPriceFbaUkFee(input: {
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}): LowPriceFbaLookupResult | null {
  const { weightG, lengthCm, widthCm, heightCm } = input;
  if (
    ![weightG, lengthCm, widthCm, heightCm].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return null;
  }

  const [longestCm, medianCm, shortestCm] = sortDimensionsCm(
    lengthCm,
    widthCm,
    heightCm,
  );

  for (const tier of LOW_PRICE_FBA_UK_TIERS) {
    if (!dimensionsFitTier(longestCm, medianCm, shortestCm, tier)) {
      continue;
    }

    const band = tier.bands.find((entry) => weightG <= entry.maxWeightG);
    if (!band) {
      continue;
    }

    return {
      tierId: tier.id,
      tierLabel: tier.label,
      maxWeightG: band.maxWeightG,
      feeGbp: band.ukGbp,
      longestCm,
      medianCm,
      shortestCm,
      weightG,
    };
  }

  return null;
}

export function formatLowPriceFbaBandLabel(
  result: Pick<LowPriceFbaLookupResult, "tierLabel" | "maxWeightG">,
): string {
  return `${result.tierLabel} · ≤ ${result.maxWeightG} g`;
}

export type LowPriceFbaUkOption = {
  id: string;
  tierId: LowPriceFbaSizeTierId;
  tierLabel: string;
  maxWeightG: number;
  maxLongestCm: number;
  maxMedianCm: number;
  maxShortestCm: number;
  feeGbp: number;
  /** Dropdown label, e.g. "Light envelope · ≤ 80 g · £1.67". */
  label: string;
};

/** Flat UK Low-price FBA bands for a size/weight dropdown. */
export function listLowPriceFbaUkOptions(): LowPriceFbaUkOption[] {
  return LOW_PRICE_FBA_UK_TIERS.flatMap((tier) =>
    tier.bands.map((band) => {
      const id = `${tier.id}:${band.maxWeightG}`;
      const bandLabel = formatLowPriceFbaBandLabel({
        tierLabel: tier.label,
        maxWeightG: band.maxWeightG,
      });
      return {
        id,
        tierId: tier.id,
        tierLabel: tier.label,
        maxWeightG: band.maxWeightG,
        maxLongestCm: tier.maxLongestCm,
        maxMedianCm: tier.maxMedianCm,
        maxShortestCm: tier.maxShortestCm,
        feeGbp: band.ukGbp,
        label: `${bandLabel} · £${band.ukGbp.toFixed(2)}`,
      };
    }),
  );
}

export function getLowPriceFbaUkOption(
  id: string,
): LowPriceFbaUkOption | null {
  return listLowPriceFbaUkOptions().find((option) => option.id === id) ?? null;
}
