/** Routes that do not require a logged-in Supabase session. */
export const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/auth/callback",
] as const;

export const PUBLIC_API_PATH_PREFIXES = [
  "/api/cron/",
  "/api/ebay/oauth/callback",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATH_PREFIXES.some((path) => pathname.startsWith(path));
}

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}
