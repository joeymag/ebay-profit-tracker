import fs from "fs/promises";
import path from "path";

const TOKEN_FILE = path.join(process.cwd(), "data", "ebay-oauth.json");

type StoredEbayTokens = {
  refreshToken: string;
  updatedAt: string;
};

export async function getStoredEbayRefreshToken(): Promise<string | null> {
  const fromEnv = process.env.EBAY_REFRESH_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredEbayTokens;
    return parsed.refreshToken?.trim() || null;
  } catch {
    return null;
  }
}

export async function saveEbayRefreshToken(refreshToken: string): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  const payload: StoredEbayTokens = {
    refreshToken,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(TOKEN_FILE, JSON.stringify(payload, null, 2), "utf8");
}

export async function clearStoredEbayRefreshToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch {
    // ignore
  }
}
