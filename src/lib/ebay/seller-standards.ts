import { ebayAnalyticsFetch } from "@/lib/ebay/analytics-client";
import { getEbayConfig } from "@/lib/ebay/config";

export type EbayStandardsLevel =
  | "TOP_RATED"
  | "ABOVE_STANDARD"
  | "BELOW_STANDARD"
  | "UNKNOWN";

export type EbayStandardsMetric = {
  key: string;
  label: string;
  value: string | null;
  /** Parsed numeric rate when value looks like a rate/count. */
  numericValue: number | null;
  rating: string | null;
  peerAverage: string | null;
};

export type EbayStandardsProfileSummary = {
  program: string;
  cycleType: string | null;
  evaluationDate: string | null;
  evaluationMonth: string | null;
  standardsLevel: EbayStandardsLevel;
  evaluationReason: string | null;
  metrics: EbayStandardsMetric[];
};

export type EbayCustomerServiceMetricSummary = {
  type: "ITEM_NOT_AS_DESCRIBED" | "ITEM_NOT_RECEIVED";
  label: string;
  evaluationType: "CURRENT" | "PROJECTED";
  marketplaceId: string | null;
  cycleStart: string | null;
  cycleEnd: string | null;
  transactionCount: number | null;
  defectCount: number | null;
  rate: number | null;
  rating: string | null;
  peerAverage: string | null;
};

export type EbaySellerStandardsSnapshot = {
  marketplaceId: string;
  profiles: EbayStandardsProfileSummary[];
  /** Prefer current UK/default program profile for the dashboard. */
  primaryProfile: EbayStandardsProfileSummary | null;
  customerService: EbayCustomerServiceMetricSummary[];
  fetchedAt: string;
};

type StandardsProfileApi = {
  cycle?: {
    cycleType?: string;
    evaluationDate?: string;
    evaluationMonth?: string;
  };
  defaultProgram?: boolean;
  evaluationReason?: string | null;
  metrics?: Array<{
    metricKey?: string;
    value?: string;
    benchmark?: {
      rating?: string;
      metadata?: { average?: string };
    };
  }>;
  program?: string;
  standardsLevel?: string;
};

type FindProfilesResponse = {
  standardsProfiles?: StandardsProfileApi[];
};

type CustomerServiceMetricResponse = {
  marketplaceId?: string;
  evaluationCycle?: {
    startDate?: string;
    endDate?: string;
    evaluationType?: string;
  };
  dimensionMetrics?: Array<{
    dimension?: { name?: string; value?: string };
    metrics?: Array<{
      metricKey?: string;
      value?: string;
      benchmark?: {
        rating?: string;
        metadata?: { average?: string };
      };
    }>;
  }>;
};

const METRIC_LABELS: Record<string, string> = {
  TRANSACTION_DEFECT_RATE: "Transaction defect rate",
  LATE_SHIPMENT_RATE: "Late shipment rate",
  CASES_CLOSED_WITHOUT_SELLER_RESOLUTION:
    "Cases closed without seller resolution",
  CLAIMS_SAF_RATE: "Claims / SAF rate",
  SHIPPING_MISS_RATE: "Shipping miss rate",
  TRACKING_UPLOADED_ON_TIME_AND_VALIDATED:
    "Tracking uploaded on time & validated",
  AVERAGE_HANDLING_TIME: "Average handling time",
};

function titleCaseKey(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLevel(value: string | undefined): EbayStandardsLevel {
  const upper = value?.trim().toUpperCase();
  if (
    upper === "TOP_RATED" ||
    upper === "ABOVE_STANDARD" ||
    upper === "BELOW_STANDARD"
  ) {
    return upper;
  }
  return "UNKNOWN";
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMetric(
  metric: NonNullable<StandardsProfileApi["metrics"]>[number],
): EbayStandardsMetric {
  const key = metric.metricKey?.trim() || "UNKNOWN";
  const value = metric.value?.trim() || null;
  return {
    key,
    label: METRIC_LABELS[key] ?? titleCaseKey(key),
    value,
    numericValue: parseNumeric(value),
    rating: metric.benchmark?.rating?.trim() || null,
    peerAverage: metric.benchmark?.metadata?.average?.trim() || null,
  };
}

function mapProfile(profile: StandardsProfileApi): EbayStandardsProfileSummary {
  return {
    program: profile.program?.trim() || "UNKNOWN",
    cycleType: profile.cycle?.cycleType?.trim() || null,
    evaluationDate: profile.cycle?.evaluationDate?.trim() || null,
    evaluationMonth: profile.cycle?.evaluationMonth?.trim() || null,
    standardsLevel: normalizeLevel(profile.standardsLevel),
    evaluationReason: profile.evaluationReason?.trim() || null,
    metrics: (profile.metrics ?? []).map(mapMetric),
  };
}

function pickPrimaryProfile(
  profiles: EbayStandardsProfileSummary[],
  marketplaceId: string,
): EbayStandardsProfileSummary | null {
  if (!profiles.length) return null;

  const programHint = marketplaceId.replace(/^EBAY_/, "PROGRAM_");
  const matchingProgram = profiles.find((profile) =>
    profile.program.toUpperCase().includes(programHint.replace("PROGRAM_", "")),
  );
  // UK marketplace often uses PROGRAM_UK / PROGRAM_EBAY_UK style names.
  const uk = profiles.find((profile) =>
    /UK|GB/i.test(profile.program),
  );
  const current = profiles.find(
    (profile) => profile.cycleType?.toUpperCase() === "CURRENT",
  );

  return (
    profiles.find(
      (profile) =>
        matchingProgram &&
        profile.program === matchingProgram.program &&
        profile.cycleType?.toUpperCase() === "CURRENT",
    ) ||
    current ||
    uk ||
    matchingProgram ||
    profiles[0] ||
    null
  );
}

function summarizeCustomerServiceMetric(
  type: "ITEM_NOT_AS_DESCRIBED" | "ITEM_NOT_RECEIVED",
  evaluationType: "CURRENT" | "PROJECTED",
  response: CustomerServiceMetricResponse,
): EbayCustomerServiceMetricSummary {
  const metrics = response.dimensionMetrics?.[0]?.metrics ?? [];
  const byKey = new Map(
    metrics
      .filter((metric) => metric.metricKey)
      .map((metric) => [metric.metricKey!.toUpperCase(), metric]),
  );

  const rateMetric = byKey.get("RATE");
  const countMetric = byKey.get("COUNT");
  const txnMetric = byKey.get("TRANSACTION_COUNT");

  return {
    type,
    label:
      type === "ITEM_NOT_AS_DESCRIBED"
        ? "Item not as described"
        : "Item not received",
    evaluationType,
    marketplaceId: response.marketplaceId?.trim() || null,
    cycleStart: response.evaluationCycle?.startDate?.trim() || null,
    cycleEnd: response.evaluationCycle?.endDate?.trim() || null,
    transactionCount: parseNumeric(txnMetric?.value ?? null),
    defectCount: parseNumeric(countMetric?.value ?? null),
    rate: parseNumeric(rateMetric?.value ?? null),
    rating: rateMetric?.benchmark?.rating?.trim() || null,
    peerAverage: rateMetric?.benchmark?.metadata?.average?.trim() || null,
  };
}

async function fetchCustomerServiceMetricSafe(
  type: "ITEM_NOT_AS_DESCRIBED" | "ITEM_NOT_RECEIVED",
  evaluationType: "CURRENT" | "PROJECTED",
  marketplaceId: string,
): Promise<EbayCustomerServiceMetricSummary | null> {
  try {
    const response = await ebayAnalyticsFetch<CustomerServiceMetricResponse>(
      `/customer_service_metric/${type}/${evaluationType}?evaluation_marketplace_id=${encodeURIComponent(marketplaceId)}`,
    );
    return summarizeCustomerServiceMetric(type, evaluationType, response);
  } catch {
    // Metric can be unavailable for new / low-volume sellers.
    return null;
  }
}

/**
 * Official eBay Seller Standards + customer service defect metrics.
 */
export async function fetchEbaySellerStandardsSnapshot(): Promise<EbaySellerStandardsSnapshot> {
  const { marketplaceId } = getEbayConfig();

  const profilesResponse =
    await ebayAnalyticsFetch<FindProfilesResponse>("/seller_standards_profile");
  const profiles = (profilesResponse.standardsProfiles ?? []).map(mapProfile);

  const customerService = (
    await Promise.all([
      fetchCustomerServiceMetricSafe(
        "ITEM_NOT_AS_DESCRIBED",
        "CURRENT",
        marketplaceId,
      ),
      fetchCustomerServiceMetricSafe(
        "ITEM_NOT_RECEIVED",
        "CURRENT",
        marketplaceId,
      ),
      fetchCustomerServiceMetricSafe(
        "ITEM_NOT_AS_DESCRIBED",
        "PROJECTED",
        marketplaceId,
      ),
      fetchCustomerServiceMetricSafe(
        "ITEM_NOT_RECEIVED",
        "PROJECTED",
        marketplaceId,
      ),
    ])
  ).filter((row): row is EbayCustomerServiceMetricSummary => row != null);

  return {
    marketplaceId,
    profiles,
    primaryProfile: pickPrimaryProfile(profiles, marketplaceId),
    customerService,
    fetchedAt: new Date().toISOString(),
  };
}
