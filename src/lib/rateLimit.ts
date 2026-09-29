import { prisma } from "./prisma";

// Simple DB-backed per-user rate limit. Works across serverless instances (no
// in-memory state) and needs no external service. Counts a user's events of a
// kind in a sliding window; if under the cap, records one and allows.
export async function rateLimit(
  userId: string,
  kind: "parse" | "run" | "apply" | "preview_parse" | "preview_run",
  max: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterMinutes: number }> {
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.usageEvent.count({ where: { userId, kind, at: { gte: since } } });
  if (count >= max) {
    return { ok: false, retryAfterMinutes: Math.ceil(windowMs / 60000) };
  }
  await prisma.usageEvent.create({ data: { userId, kind } });
  return { ok: true, retryAfterMinutes: 0 };
}

// Cost-protection caps (per user, per hour). Generous for a real job-seeker,
// tight enough to stop a runaway loop or abusive session.
export const LIMITS = {
  parse: { max: 20, windowMs: 60 * 60 * 1000 },
  run: { max: 30, windowMs: 60 * 60 * 1000 },
  // Apply-assist runs on Sonnet (pricier); a tighter cap while it's free.
  apply: { max: 15, windowMs: 60 * 60 * 1000 },
} as const;

// Anonymous (signed-out) preview caps — keyed by IP, not user. Tighter than the
// authenticated caps because the caller is unauthenticated and every call costs
// LLM money: enough for a genuine try-before-signup, tight enough to blunt abuse
// of a public, cost-incurring endpoint.
//
// TEMPORARY testing allowance (requested 2026-09-29): much higher caps until the
// timestamp below, after which the normal limits apply again on their own. Delete
// this block and TESTING_UNTIL once testing is done.
const TESTING_UNTIL = Date.UTC(2026, 8, 30, 4, 0, 0); // 2026-09-30 04:00 UTC
const testing = Date.now() < TESTING_UNTIL;
export const ANON_LIMITS = {
  parse: { max: testing ? 200 : 6, windowMs: 60 * 60 * 1000 },
  run: { max: testing ? 500 : 12, windowMs: 60 * 60 * 1000 },
};

// Client IP for anonymous rate limiting. Trust ONLY proxy-set values: Vercel
// sets x-real-ip to the true client IP at the edge. The LEFTMOST x-forwarded-for
// value is client-supplied and trivially spoofable (a fresh header per request
// would mint a new "IP" and defeat the per-IP cap), so we never use it — we fall
// back to the LAST x-forwarded-for hop (added by the trusted proxy) only if
// x-real-ip is absent, then to a single shared bucket (fails to a cap, not open).
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return "unknown";
}
