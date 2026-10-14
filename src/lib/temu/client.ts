import { temuRouterUrl, type TemuCredentials } from "@/lib/temu/config";
import { signTemuRequest } from "@/lib/temu/sign";

type TemuResponse = {
  success?: boolean;
  errorCode?: number;
  errorMsg?: string;
  error_msg?: string;
  result?: {
    mallId?: number | string;
    expiredTime?: number;
  };
};

export type TemuTokenInfo = {
  mallId: string | null;
  expiredTime: number | null;
};

const TEMU_PROXY =
  process.env.TEMU_PROXY_URL?.trim() || "https://145.241.234.131.sslip.io";
const TEMU_PROXY_TOKEN = process.env.TEMU_PROXY_SECRET?.trim() ?? "";

async function postTemu(region: TemuCredentials["region"], body: string): Promise<Response> {
  return fetch(`${TEMU_PROXY}/temu`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEMU_PROXY_TOKEN}`,
      "x-temu-target": temuRouterUrl(region),
    },
    body,
  });
}

export async function getTemuAccessTokenInfo(
  credentials: TemuCredentials,
): Promise<TemuTokenInfo> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = {
    type: "bg.open.accesstoken.info.get",
    app_key: credentials.appKey,
    access_token: credentials.accessToken,
    timestamp,
    data_type: "JSON",
  };
  params.sign = signTemuRequest(params, credentials.appSecret);

  const response = await postTemu(credentials.region, JSON.stringify(params));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Temu request failed (${response.status}).`);
  }

  let data: TemuResponse;
  try {
    data = JSON.parse(text) as TemuResponse;
  } catch {
    throw new Error("Temu returned a response that was not JSON.");
  }

  if (!data.success) {
    const message = data.errorMsg || data.error_msg || "Temu rejected the keys.";
    throw new Error(message);
  }

  const mallId = data.result?.mallId;
  return {
    mallId: mallId == null || mallId === "" ? null : String(mallId),
    expiredTime: data.result?.expiredTime ?? null,
  };
}

export class TemuApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemuApiError";
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeys(source[key]);
    }
    return sorted;
  }
  return value;
}

async function signedTemuCall<T>(
  credentials: TemuCredentials,
  fields: Record<string, string>,
): Promise<T> {
  const params = { ...fields };
  params.sign = signTemuRequest(params, credentials.appSecret);

  const response = await postTemu(credentials.region, JSON.stringify(params));
  const text = await response.text();
  if (!response.ok) {
    throw new TemuApiError(`Temu request failed (${response.status}).`);
  }

  let data: TemuResponse & { result?: T };
  try {
    data = JSON.parse(text) as TemuResponse & { result?: T };
  } catch {
    throw new TemuApiError("Temu returned a response that was not JSON.");
  }
  if (!data.success || data.result == null) {
    throw new TemuApiError(
      data.errorMsg || data.error_msg || "Temu rejected the request.",
    );
  }
  return data.result;
}

/** Signed Temu router call. Business fields go in `request`. */
export async function temuCall<T>(
  credentials: TemuCredentials,
  type: string,
  request: Record<string, unknown>,
): Promise<T> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return signedTemuCall<T>(credentials, {
    type,
    app_key: credentials.appKey,
    access_token: credentials.accessToken,
    timestamp,
    data_type: "JSON",
    request: JSON.stringify(sortKeys(request)),
  });
}

/** Top-level business fields, with numbers left as JSON numbers. Temu signs the decimal text. */
export async function temuCallValues<T>(
  credentials: TemuCredentials,
  type: string,
  fields: Record<string, string | number>,
): Promise<T> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signedFields: Record<string, string> = {
    type,
    app_key: credentials.appKey,
    access_token: credentials.accessToken,
    timestamp,
    data_type: "JSON",
  };
  for (const [key, value] of Object.entries(fields)) {
    signedFields[key] = String(value);
  }
  const sign = signTemuRequest(signedFields, credentials.appSecret);
  const body: Record<string, string | number> = { ...signedFields, ...fields, sign };

  const response = await postTemu(credentials.region, JSON.stringify(body));
  const text = await response.text();
  if (!response.ok) {
    throw new TemuApiError(`Temu request failed (${response.status}).`);
  }
  let data: TemuResponse & { result?: T };
  try {
    data = JSON.parse(text) as TemuResponse & { result?: T };
  } catch {
    throw new TemuApiError("Temu returned a response that was not JSON.");
  }
  if (!data.success || data.result == null) {
    throw new TemuApiError(
      data.errorMsg || data.error_msg || "Temu rejected the request.",
    );
  }
  return data.result;
}

/** Same call with business fields as top-level parameters, matching Temu's curl examples. */
export async function temuCallFlat<T>(
  credentials: TemuCredentials,
  type: string,
  fields: Record<string, string>,
): Promise<T> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return signedTemuCall<T>(credentials, {
    type,
    app_key: credentials.appKey,
    access_token: credentials.accessToken,
    timestamp,
    data_type: "JSON",
    ...fields,
  });
}
