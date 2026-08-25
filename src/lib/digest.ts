import { createHmac } from "crypto";

// One-click unsubscribe token: HMAC(userId) with CRON_SECRET. No DB token table
// needed; the link stays valid and verifiable.
export function unsubToken(userId: string): string {
  const secret = process.env.CRON_SECRET || "dev-secret";
  return createHmac("sha256", secret).update(`unsub:${userId}`).digest("hex").slice(0, 32);
}

export function verifyUnsub(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  return unsubToken(userId) === token;
}

export const APP_URL = process.env.APP_URL || "https://findmeajob.online";
