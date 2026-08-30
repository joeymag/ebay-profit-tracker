export function applyPricePercentChange(
  currentPrice: number,
  percentChange: number,
): number {
  const factor = 1 + percentChange / 100;
  const next = currentPrice * factor;
  return Math.max(0.01, Math.round(next * 100) / 100);
}
