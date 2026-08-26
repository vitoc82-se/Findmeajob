import { createHmac } from "crypto";
import { safeEqualStr } from "./secret";

// One-click unsubscribe token: HMAC(userId) with CRON_SECRET. No DB token table
// needed; the link stays valid and verifiable. Fails closed when CRON_SECRET is
// unset — no hardcoded fallback secret that would make tokens forgeable.
function tokenFor(userId: string): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`unsub:${userId}`).digest("hex").slice(0, 32);
}

export function unsubToken(userId: string): string {
  const t = tokenFor(userId);
  if (!t) throw new Error("CRON_SECRET is not set");
  return t;
}

export function verifyUnsub(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const expected = tokenFor(userId);
  // Constant-time compare; false if the secret is unset (can't verify → deny).
  return expected !== null && safeEqualStr(expected, token);
}

export const APP_URL = process.env.APP_URL || "https://findmeajob.online";
