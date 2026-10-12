export const TEMU_REGIONS = ["eu", "us", "global"] as const;

export type TemuRegion = (typeof TEMU_REGIONS)[number];

const ROUTERS: Record<TemuRegion, string> = {
  eu: "https://openapi-b-eu.temu.com/openapi/router",
  us: "https://openapi-b-us.temu.com/openapi/router",
  global: "https://openapi-b-global.temu.com/openapi/router",
};

export function parseTemuRegion(value: string | null | undefined): TemuRegion {
  const region = value?.trim().toLowerCase();
  if (region === "us" || region === "global" || region === "eu") return region;
  return "eu";
}

export function temuRouterUrl(region: TemuRegion): string {
  return ROUTERS[region];
}

export type TemuCredentials = {
  appKey: string;
  appSecret: string;
  accessToken: string;
  region: TemuRegion;
  mallId: string | null;
};

export function temuCredentialsFromEnv(): TemuCredentials | null {
  const appKey = process.env.TEMU_APP_KEY?.trim();
  const appSecret = process.env.TEMU_APP_SECRET?.trim();
  const accessToken = process.env.TEMU_ACCESS_TOKEN?.trim();
  if (!appKey || !appSecret || !accessToken) return null;
  return {
    appKey,
    appSecret,
    accessToken,
    region: parseTemuRegion(process.env.TEMU_REGION),
    mallId: process.env.TEMU_MALL_ID?.trim() || null,
  };
}
