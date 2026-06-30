import {
  generateSignature,
  generateSignatureInput,
} from "digital-signature-nodejs-sdk";

import { getEbayConfig } from "@/lib/ebay/config";
import { getStoredEbaySigningKey } from "@/lib/ebay/signing-key-store";

type SignatureConfig = {
  digestAlgorithm: string;
  jwe: string;
  privateKey: string;
  signatureComponents: {
    method: string;
    authority: string;
    path: string;
  };
  signatureParams: string[];
};

const FINANCES_SIGNATURE_PARAMS = [
  "x-ebay-signature-key",
  "@method",
  "@path",
  "@authority",
] as const;

function buildSignatureConfig(
  requestUrl: URL,
  method: string,
  signingKey: { privateKey: string; jwe: string },
): SignatureConfig {
  return {
    digestAlgorithm: "sha256",
    jwe: signingKey.jwe,
    privateKey: signingKey.privateKey,
    signatureComponents: {
      method: method.toUpperCase(),
      authority: requestUrl.host,
      path: requestUrl.pathname,
    },
    signatureParams: [...FINANCES_SIGNATURE_PARAMS],
  };
}

export class EbaySigningKeyMissingError extends Error {
  constructor() {
    super(
      "eBay signing key is not configured. Generate one in Settings → eBay Finances API.",
    );
    this.name = "EbaySigningKeyMissingError";
  }
}

export async function buildFinancesSignatureHeaders(
  requestUrl: URL,
  method = "GET",
): Promise<Record<string, string>> {
  const signingKey = await getStoredEbaySigningKey();
  if (!signingKey) {
    throw new EbaySigningKeyMissingError();
  }

  getEbayConfig();

  const config = buildSignatureConfig(requestUrl, method, signingKey);
  const generatedHeaders: Record<string, string> = {
    "x-ebay-signature-key": signingKey.jwe,
  };

  const signatureInput = generateSignatureInput(
    generatedHeaders,
    config as Parameters<typeof generateSignatureInput>[1],
  );
  generatedHeaders["signature-input"] = signatureInput;

  const signature = generateSignature(
    generatedHeaders,
    config as Parameters<typeof generateSignature>[1],
  );
  generatedHeaders.signature = signature;

  return generatedHeaders;
}
