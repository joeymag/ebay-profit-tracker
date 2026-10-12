import { createHash } from "node:crypto";

/** Temu sign: MD5(app_secret + sorted key/value pairs + app_secret), uppercase. */
export function signTemuRequest(
  params: Record<string, string>,
  appSecret: string,
): string {
  const payload = Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== "")
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return createHash("md5")
    .update(`${appSecret}${payload}${appSecret}`)
    .digest("hex")
    .toUpperCase();
}
