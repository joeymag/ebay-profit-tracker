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

  const response = await fetch(temuRouterUrl(credentials.region), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
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
