import { prisma } from "./prisma";

// Simple DB-backed per-user rate limit. Works across serverless instances (no
// in-memory state) and needs no external service. Counts a user's events of a
// kind in a sliding window; if under the cap, records one and allows.
export interface RateLimitResult {
  ok: boolean;
  retryAfterMinutes: number;
  // True when the shared daily budget (not this caller's own limit) is what ran out.
  global?: boolean;
}

export const PAUSED_MESSAGE =
  "Tjänsten är tillfälligt pausad för att hålla kostnaderna nere. Försök igen om en stund.";

// Global circuit breaker. The per-caller limits above stop one person; this stops the
// sum of everyone (a botnet, a viral spike, a runaway loop) from draining the Anthropic
// and Voyage credit. Counts every caller's events of a kind over the last 24 h.
// Override a cap with env GLOBAL_CAP_<KIND> (e.g. GLOBAL_CAP_PREVIEW_RUN=5000, 0 = off);
// set LLM_KILL_SWITCH=1 to refuse all costly calls at once.
const GLOBAL_DAILY_CAPS: Record<string, number> = {
  parse: 1500,
  run: 2500,
  apply: 800,
  preview_parse: 2000,
  preview_run: 3000,
};

function globalCap(kind: string): number {
  const raw = process.env[`GLOBAL_CAP_${kind.toUpperCase()}`];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : (GLOBAL_DAILY_CAPS[kind] ?? 0);
}

async function globalBudgetExceeded(kind: string): Promise<boolean> {
  if (process.env.LLM_KILL_SWITCH === "1") return true;
  const cap = globalCap(kind);
  if (cap === 0) return false;
  try {
    const used = await prisma.usageEvent.count({
      where: { kind, at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    return used >= cap;
  } catch (err) {
    console.error("[rateLimit] global budget check failed, allowing:", err);
    return false;
  }
}

export async function rateLimit(
  userId: string,
  kind: "parse" | "run" | "apply" | "preview_parse" | "preview_run",
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (await globalBudgetExceeded(kind)) {
    console.error(`[rateLimit] global daily budget reached for ${kind}; refusing`);
    return { ok: false, retryAfterMinutes: 60, global: true };
  }
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
export const ANON_LIMITS = {
  parse: { max: 6, windowMs: 60 * 60 * 1000 },
  run: { max: 12, windowMs: 60 * 60 * 1000 },
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
