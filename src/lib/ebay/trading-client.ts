import { getEbayAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";

const TRADING_COMPATIBILITY_LEVEL = "1193";

/** eBay Trading API site IDs. */
export function ebayTradingSiteId(marketplaceId: string): string {
  switch (marketplaceId.trim().toUpperCase()) {
    case "EBAY_US":
    case "EBAY_MOTORS_US":
      return "0";
    case "EBAY_CA":
      return "2";
    case "EBAY_GB":
      return "3";
    case "EBAY_AU":
      return "15";
    case "EBAY_AT":
      return "16";
    case "EBAY_FR":
      return "71";
    case "EBAY_DE":
      return "77";
    case "EBAY_IT":
      return "101";
    case "EBAY_BE":
      return "23";
    case "EBAY_NL":
      return "146";
    case "EBAY_ES":
      return "186";
    case "EBAY_CH":
      return "193";
    case "EBAY_IE":
      return "205";
    default:
      return "3";
  }
}

function getTradingEndpoint(): string {
  const { isSandbox } = getEbayConfig();
  return isSandbox
    ? "https://api.sandbox.ebay.com/ws/api.dll"
    : "https://api.ebay.com/ws/api.dll";
}

export async function ebayTradingCall(
  callName: string,
  requestBodyXml: string,
): Promise<string> {
  const { clientId, clientSecret, marketplaceId } = getEbayConfig();
  const accessToken = await getEbayAccessToken();
  const devId = process.env.EBAY_DEV_ID?.trim() ?? "";

  const headers: Record<string, string> = {
    "Content-Type": "text/xml",
    "X-EBAY-API-CALL-NAME": callName,
    "X-EBAY-API-SITEID": ebayTradingSiteId(marketplaceId),
    "X-EBAY-API-COMPATIBILITY-LEVEL": TRADING_COMPATIBILITY_LEVEL,
    "X-EBAY-API-IAF-TOKEN": accessToken,
  };

  if (devId) {
    headers["X-EBAY-API-DEV-NAME"] = devId;
  }
  if (clientId) {
    headers["X-EBAY-API-APP-NAME"] = clientId;
  }
  if (clientSecret) {
    headers["X-EBAY-API-CERT-NAME"] = clientSecret;
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
${requestBodyXml}
</${callName}Request>`;

  const response = await fetch(getTradingEndpoint(), {
    method: "POST",
    cache: "no-store",
    headers,
    body: xml,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new EbayApiError(
      `eBay Trading API error (${response.status})`,
      response.status,
      text.slice(0, 1000),
    );
  }

  const ack = extractXmlTag(text, "Ack");
  if (ack && ["FAILURE", "PARTIALFAILURE"].includes(ack.toUpperCase())) {
    const shortMessage =
      extractXmlTag(text, "ShortMessage") ??
      extractXmlTag(text, "LongMessage") ??
      "Trading API call failed";
    throw new EbayApiError(
      `eBay Trading API: ${shortMessage}`,
      400,
      text.slice(0, 1000),
    );
  }

  return text;
}

export function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  if (!match?.[1]) {
    return null;
  }

  return decodeXmlEntities(match[1].trim());
}

export function extractXmlAttr(
  xml: string,
  tag: string,
  attr: string,
): string | null {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "i");
  const match = xml.match(re);
  if (!match?.[1]) {
    return null;
  }

  const attrMatch = match[1].match(
    new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i"),
  );
  return attrMatch?.[1] ? decodeXmlEntities(attrMatch[1]) : null;
}

export function extractXmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    blocks.push(match[1] ?? "");
  }
  return blocks;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
