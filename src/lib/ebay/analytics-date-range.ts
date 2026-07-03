const TIMEZONE = "Europe/London";

type YmdParts = {
  year: number;
  month: number;
  day: number;
};

function getZonedParts(date: Date): YmdParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

export function toLondonYmd(date: Date): string {
  const parts = getZonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getLondonUtcOffset(ymd: string): string {
  const noonUtc = new Date(`${ymd}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    timeZoneName: "longOffset",
  }).formatToParts(noonUtc);

  const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value;
  const match = offsetPart?.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return "+00:00";
  }

  const hours = match[1]!.padStart(3, match[1]!.startsWith("-") ? "-0" : "+0");
  const minutes = match[2] ?? "00";
  return `${hours}:${minutes}`;
}

export function formatAnalyticsDateRange(startYmd: string, endYmd: string): string {
  const offset = getLondonUtcOffset(startYmd);
  return `[${startYmd}T00:00:00.000${offset}..${endYmd}T00:00:00.000${offset}]`;
}

export function periodBoundsToYmd(startedAt: string, endedAt: string | null): {
  startYmd: string;
  endYmd: string;
} {
  return {
    startYmd: toLondonYmd(new Date(startedAt)),
    endYmd: toLondonYmd(endedAt ? new Date(endedAt) : new Date()),
  };
}

export function daysInclusive(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00Z`);
  const end = new Date(`${endYmd}T12:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
}
