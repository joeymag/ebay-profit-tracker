import { getEbayApplicationAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";
import { normalizeEbaySigningMaterial } from "@/lib/ebay/normalize-signing-key";
import type { EbaySigningKeyMaterial } from "@/lib/ebay/signing-key-store";

type CreateSigningKeyResponse = {
  signingKeyId?: string;
  privateKey?: string;
  jwe?: string;
  publicKey?: string;
};

export async function createEbaySigningKey(): Promise<EbaySigningKeyMaterial> {
  const { keyManagementBaseUrl } = getEbayConfig();
  const accessToken = await getEbayApplicationAccessToken();

  const response = await fetch(`${keyManagementBaseUrl}/signing_key`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ signingKeyCipher: "ED25519" }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `eBay Key Management API error (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  const data = JSON.parse(text) as CreateSigningKeyResponse;
  if (!data.privateKey || !data.jwe) {
    throw new Error("eBay did not return signing key material.");
  }

  return normalizeEbaySigningMaterial({
    privateKey: data.privateKey,
    jwe: data.jwe,
    signingKeyId: data.signingKeyId ?? null,
  });
}
