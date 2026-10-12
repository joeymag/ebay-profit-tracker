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

const TEMU_PROXY = "https://145.241.234.131.sslip.io";
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
