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
    value?: string | number | boolean | null;
    benchmark?: {
      rating?: string | number | null;
      metadata?: { average?: string | number | null };
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
      value?: string | number | boolean | null;
      benchmark?: {
        rating?: string | number | null;
        metadata?: { average?: string | number | null };
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

/** eBay sometimes returns numbers/booleans where docs say string. */
function asTrimmedString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function normalizeLevel(value: string | undefined): EbayStandardsLevel {
  const upper = asTrimmedString(value)?.toUpperCase();
  if (
    upper === "TOP_RATED" ||
    upper === "ABOVE_STANDARD" ||
    upper === "BELOW_STANDARD"
  ) {
    return upper;
  }
  return "UNKNOWN";
}

function parseNumeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(asTrimmedString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMetric(
  metric: NonNullable<StandardsProfileApi["metrics"]>[number],
): EbayStandardsMetric {
  const key = asTrimmedString(metric.metricKey) || "UNKNOWN";
  const value = asTrimmedString(metric.value);
  return {
    key,
    label: METRIC_LABELS[key] ?? titleCaseKey(key),
    value,
    numericValue: parseNumeric(metric.value ?? value),
    rating: asTrimmedString(metric.benchmark?.rating),
    peerAverage: asTrimmedString(metric.benchmark?.metadata?.average),
  };
}

function mapProfile(profile: StandardsProfileApi): EbayStandardsProfileSummary {
  return {
    program: asTrimmedString(profile.program) || "UNKNOWN",
    cycleType: asTrimmedString(profile.cycle?.cycleType),
    evaluationDate: asTrimmedString(profile.cycle?.evaluationDate),
    evaluationMonth: asTrimmedString(profile.cycle?.evaluationMonth),
    standardsLevel: normalizeLevel(profile.standardsLevel),
    evaluationReason: asTrimmedString(profile.evaluationReason),
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
  const byKey = new Map<
    string,
    NonNullable<
      NonNullable<CustomerServiceMetricResponse["dimensionMetrics"]>[number]["metrics"]
    >[number]
  >();
  for (const metric of metrics) {
    const key = asTrimmedString(metric.metricKey)?.toUpperCase();
    if (key) byKey.set(key, metric);
  }

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
    marketplaceId: asTrimmedString(response.marketplaceId),
    cycleStart: asTrimmedString(response.evaluationCycle?.startDate),
    cycleEnd: asTrimmedString(response.evaluationCycle?.endDate),
    transactionCount: parseNumeric(txnMetric?.value ?? null),
    defectCount: parseNumeric(countMetric?.value ?? null),
    rate: parseNumeric(rateMetric?.value ?? null),
    rating: asTrimmedString(rateMetric?.benchmark?.rating),
    peerAverage: asTrimmedString(rateMetric?.benchmark?.metadata?.average),
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
