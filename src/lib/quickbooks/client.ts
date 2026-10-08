import { getQuickbooksAccessToken } from "@/lib/quickbooks/auth";
import { getQuickbooksConfig } from "@/lib/quickbooks/config";
import { QuickbooksApiError } from "@/lib/quickbooks/errors";

const MINOR_VERSION = "75";

export async function quickbooksFetch<T>(path: string): Promise<T> {
  const { apiBaseUrl } = getQuickbooksConfig();
  const { accessToken, realmId } = await getQuickbooksAccessToken();
  const url = new URL(
    `${apiBaseUrl}/v3/company/${encodeURIComponent(realmId)}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (!url.searchParams.has("minorversion")) {
    url.searchParams.set("minorversion", MINOR_VERSION);
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new QuickbooksApiError(
      `QuickBooks API error (${response.status})`,
      response.status,
      text,
    );
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

type CompanyInfoResponse = {
  CompanyInfo?: { CompanyName?: string };
};

export async function fetchQuickbooksCompanyName(
  realmId: string,
): Promise<string | null> {
  const data = await quickbooksFetch<CompanyInfoResponse>(
    `/companyinfo/${encodeURIComponent(realmId)}`,
  );
  return data.CompanyInfo?.CompanyName?.trim() || null;
}

export type QuickbooksReport = {
  Columns?: {
    Column?: Array<{ ColTitle?: string; ColType?: string }>;
  };
  Rows?: { Row?: QuickbooksReportRow[] };
};

export type QuickbooksReportRow = {
  type?: string;
  ColData?: Array<{ value?: string; id?: string }>;
  Rows?: { Row?: QuickbooksReportRow[] };
  Header?: { ColData?: Array<{ value?: string }> };
};

export async function fetchTransactionListReport(
  startDate: string,
  endDate: string,
): Promise<QuickbooksReport> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    minorversion: MINOR_VERSION,
  });
  return quickbooksFetch<QuickbooksReport>(
    `/reports/TransactionList?${params.toString()}`,
  );
}
