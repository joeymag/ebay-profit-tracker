export function parsePercentInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed.replace(/%/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

export function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}
