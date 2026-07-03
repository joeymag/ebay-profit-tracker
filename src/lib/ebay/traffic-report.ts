import {
  getDateRangeBounds,
  getDateRangeLabel,
  parseDateRange,
  type DateRangeKey,
} from "@/lib/date-range";
import { ebayAnalyticsFetch } from "@/lib/ebay/analytics-client";
import { getEbayConfig } from "@/lib/ebay/config";
import type { ListingTrafficReport, ListingTrafficRow } from "@/lib/ebay/traffic-report-types";

export type { ListingTrafficReport, ListingTrafficRow } from "@/lib/ebay/traffic-report-types";

const TRAFFIC_REPORT_METRICS = [
  "LISTING_IMPRESSION_SEARCH_RESULTS_PAGE",
  "LISTING_IMPRESSION_TOTAL",
  "TOTAL_IMPRESSION_TOTAL",
  "LISTING_VIEWS_TOTAL",
  "CLICK_THROUGH_RATE",
  "TRANSACTION",
  "SALES_CONVERSION_RATE",
] as const;

type ReportValue = {
  applicable?: boolean;
  value?: unknown;
};

type TrafficReportResponse = {
  startDate?: string;
  endDate?: string;
  lastUpdatedDate?: string;
  warnings?: Array<{ message?: string; longMessage?: string }>;
  header?: {
    metrics?: Array<{ key?: string }>;
  };
  dimensionMetadata?: Array<{
    metadataHeader?: { key?: string; metadataKeys?: Array<{ key?: string }> };
    metadataRecords?: Array<{
      value?: ReportValue;
      metadataValues?: ReportValue[];
    }>;
  }>;
  records?: Array<{
    dimensionValues?: ReportValue[];
    metricValues?: ReportValue[];
  }>;
};

function getLondonUtcOffset(ymd: string): string {
  const noonUtc = new Date(`${ymd}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
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

function formatAnalyticsDateRange(startYmd: string, endYmd: string): string {
  const offset = getLondonUtcOffset(startYmd);
  return `[${startYmd}T00:00:00.000${offset}..${endYmd}T00:00:00.000${offset}]`;
}

function resolveAnalyticsDateBounds(range: DateRangeKey): {
  startYmd: string;
  endYmd: string;
  rangeLabel: string;
} {
  if (range === "all") {
    const end = getDateRangeBounds("30days").endYmd!;
    const startParts = end.split("-").map(Number);
    const endDate = new Date(
      Date.UTC(startParts[0]!, startParts[1]! - 1, startParts[2]!),
    );
    endDate.setUTCDate(endDate.getUTCDate() - 89);
    const startYmd = endDate.toISOString().slice(0, 10);

    return {
      startYmd,
      endYmd: end,
      rangeLabel: "Last 90 days (eBay analytics limit for all-time filter)",
    };
  }

  const bounds = getDateRangeBounds(range);
  if (!bounds.startYmd || !bounds.endYmd) {
    const fallback = getDateRangeBounds("30days");
    return {
      startYmd: fallback.startYmd!,
      endYmd: fallback.endYmd!,
      rangeLabel: getDateRangeLabel("30days"),
    };
  }

  return {
    startYmd: bounds.startYmd,
    endYmd: bounds.endYmd,
    rangeLabel: getDateRangeLabel(range),
  };
}

function parseMetricNumber(value: ReportValue | undefined): number | null {
  if (!value?.applicable || value.value == null) {
    return null;
  }

  const parsed = Number(value.value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseListingTitles(response: TrafficReportResponse): Map<string, string> {
  const titles = new Map<string, string>();

  for (const metadata of response.dimensionMetadata ?? []) {
    if (metadata.metadataHeader?.key !== "LISTING_ID") {
      continue;
    }

    const keys =
      metadata.metadataHeader.metadataKeys?.map((entry) => entry.key) ?? [];
    const titleIndex = keys.indexOf("LISTING_TITLE");

    for (const record of metadata.metadataRecords ?? []) {
      const listingId = record.value?.value;
      if (typeof listingId !== "string" || !listingId.trim()) {
        continue;
      }

      const titleValue =
        titleIndex >= 0
          ? record.metadataValues?.[titleIndex]?.value
          : undefined;

      if (typeof titleValue === "string" && titleValue.trim()) {
        titles.set(listingId.trim(), titleValue.trim());
      }
    }
  }

  return titles;
}

function parseListingTrafficRows(
  response: TrafficReportResponse,
): ListingTrafficRow[] {
  const metricKeys =
    response.header?.metrics?.map((metric) => metric.key).filter(Boolean) ?? [];
  const titles = parseListingTitles(response);

  return (response.records ?? [])
    .map((record) => {
      const listingId = record.dimensionValues?.[0]?.value;
      if (typeof listingId !== "string" || !listingId.trim()) {
        return null;
      }

      const metrics = new Map<string, number | null>();
      record.metricValues?.forEach((metricValue, index) => {
        const key = metricKeys[index];
        if (key) {
          metrics.set(key, parseMetricNumber(metricValue));
        }
      });

      const id = listingId.trim();
      return {
        listingId: id,
        title: titles.get(id) ?? null,
        searchImpressions: metrics.get("LISTING_IMPRESSION_SEARCH_RESULTS_PAGE") ?? null,
        totalImpressions: metrics.get("LISTING_IMPRESSION_TOTAL") ?? null,
        allImpressions: metrics.get("TOTAL_IMPRESSION_TOTAL") ?? null,
        views: metrics.get("LISTING_VIEWS_TOTAL") ?? null,
        clickThroughRate: metrics.get("CLICK_THROUGH_RATE") ?? null,
        transactions: metrics.get("TRANSACTION") ?? null,
        salesConversionRate: metrics.get("SALES_CONVERSION_RATE") ?? null,
      } satisfies ListingTrafficRow;
    })
    .filter((row): row is ListingTrafficRow => row != null);
}

export async function fetchListingTrafficReport(options?: {
  range?: string;
}): Promise<ListingTrafficReport> {
  const range = parseDateRange(options?.range);
  const { marketplaceId } = getEbayConfig();
  const { startYmd, endYmd, rangeLabel } = resolveAnalyticsDateBounds(range);
  const filter = encodeURIComponent(
    `marketplace_ids:{${marketplaceId}},date_range:${formatAnalyticsDateRange(startYmd, endYmd)}`,
  );
  const metrics = encodeURIComponent(TRAFFIC_REPORT_METRICS.join(","));
  const path =
    `/traffic_report?dimension=LISTING&filter=${filter}&metric=${metrics}&sort=-LISTING_VIEWS_TOTAL`;

  const response = await ebayAnalyticsFetch<TrafficReportResponse>(path);
  const warnings = (response.warnings ?? [])
    .map((warning) => warning.longMessage ?? warning.message)
    .filter((message): message is string => Boolean(message));

  return {
    range,
    rangeLabel,
    startDate: response.startDate ?? null,
    endDate: response.endDate ?? null,
    lastUpdatedDate: response.lastUpdatedDate ?? null,
    marketplaceId,
    listings: parseListingTrafficRows(response),
    warnings,
  };
}
