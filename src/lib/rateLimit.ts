import { prisma } from "./prisma";

// Simple DB-backed per-user rate limit. Works across serverless instances (no
// in-memory state) and needs no external service. Counts a user's events of a
// kind in a sliding window; if under the cap, records one and allows.
export async function rateLimit(
  userId: string,
  kind: "parse" | "run",
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
} as const;
