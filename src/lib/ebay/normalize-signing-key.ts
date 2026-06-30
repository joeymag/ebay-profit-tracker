function normalizeEscapedNewlines(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

/** eBay Key Management API returns base64 PKCS#8 body without PEM headers. */
export function normalizeEbayPrivateKeyToPem(privateKey: string): string {
  const trimmed = normalizeEscapedNewlines(privateKey.trim());

  if (/-----BEGIN [A-Z ]+KEY-----/.test(trimmed)) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }

  const body = trimmed.replace(/\s+/g, "");
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

export function normalizeEbaySigningMaterial<T extends { privateKey: string }>(
  material: T,
): T {
  return {
    ...material,
    privateKey: normalizeEbayPrivateKeyToPem(material.privateKey),
  };
}
