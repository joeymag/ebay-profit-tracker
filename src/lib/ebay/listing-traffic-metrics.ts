import { formatAnalyticsDateRange } from "@/lib/ebay/analytics-date-range";
import { ebayAnalyticsFetch } from "@/lib/ebay/analytics-client";
import { getEbayConfig } from "@/lib/ebay/config";
import { TRAFFIC_REPORT_METRICS } from "@/lib/ebay/traffic-report";
import type { ListingTrafficRow } from "@/lib/ebay/traffic-report-types";

type ReportValue = {
  applicable?: boolean;
  value?: unknown;
};

type TrafficReportResponse = {
  records?: Array<{
    dimensionValues?: ReportValue[];
    metricValues?: ReportValue[];
  }>;
  header?: {
    metrics?: Array<{ key?: string }>;
  };
};

function parseMetricNumber(value: ReportValue | undefined): number | null {
  if (!value?.applicable || value.value == null) {
    return null;
  }

  const parsed = Number(value.value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseListingMetricsRow(
  listingId: string,
  response: TrafficReportResponse,
): ListingTrafficRow | null {
  const record = response.records?.[0];
  if (!record) {
    return null;
  }

  const metricKeys =
    response.header?.metrics?.map((metric) => metric.key).filter(Boolean) ?? [];
  const metrics = new Map<string, number | null>();

  record.metricValues?.forEach((metricValue, index) => {
    const key = metricKeys[index];
    if (key) {
      metrics.set(key, parseMetricNumber(metricValue));
    }
  });

  return {
    listingId,
    title: null,
    searchImpressions: metrics.get("LISTING_IMPRESSION_SEARCH_RESULTS_PAGE") ?? null,
    totalImpressions: metrics.get("LISTING_IMPRESSION_TOTAL") ?? null,
    allImpressions: metrics.get("TOTAL_IMPRESSION_TOTAL") ?? null,
    views: metrics.get("LISTING_VIEWS_TOTAL") ?? null,
    clickThroughRate: metrics.get("CLICK_THROUGH_RATE") ?? null,
    transactions: metrics.get("TRANSACTION") ?? null,
    salesConversionRate: metrics.get("SALES_CONVERSION_RATE") ?? null,
  };
}

export async function fetchListingTrafficMetrics(
  listingId: string,
  startYmd: string,
  endYmd: string,
): Promise<ListingTrafficRow | null> {
  const { marketplaceId } = getEbayConfig();
  const listingFilter = encodeURIComponent(`{${listingId.trim()}}`);
  const dateRange = formatAnalyticsDateRange(startYmd, endYmd);
  const filter = encodeURIComponent(
    `marketplace_ids:{${marketplaceId}},listing_ids:${listingFilter},date_range:${dateRange}`,
  );
  const metrics = encodeURIComponent(TRAFFIC_REPORT_METRICS.join(","));
  const path = `/traffic_report?dimension=LISTING&filter=${filter}&metric=${metrics}`;

  const response = await ebayAnalyticsFetch<TrafficReportResponse>(path);
  return parseListingMetricsRow(listingId.trim(), response);
}
