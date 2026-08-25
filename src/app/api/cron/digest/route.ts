import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { executeSearch, type SearchFilters } from "@/lib/matching/runSearch";
import { sendEmail, buildDigestEmail, type DigestMatch } from "@/lib/email";
import { unsubToken, APP_URL } from "@/lib/digest";
import type { Profile } from "@/lib/matching/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_SCORE = 70; // only email strong matches
const MAX_PER_EMAIL = 10;

// GET /api/cron/digest — invoked daily by Vercel Cron.
// Vercel sends "Authorization: Bearer $CRON_SECRET"; we verify it so nobody else
// can trigger the (LLM-costing) run.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await prisma.profile.findMany({ where: { digestEnabled: true } });
  let usersProcessed = 0;
  let emailsSent = 0;
  const errors: string[] = [];
  const client = await clerkClient();

  for (const p of profiles) {
    usersProcessed++;
    try {
      const profile = p.extracted as unknown as Profile;
      const pref = (p.preferences as Record<string, unknown> | null) ?? {};
      const filters: SearchFilters = {
        titles:
          Array.isArray(pref.titles) && pref.titles.length ? (pref.titles as string[]) : profile.titles,
        country: typeof pref.country === "string" ? (pref.country as string) : "se",
        regions: Array.isArray(pref.regions) ? (pref.regions as string[]) : [],
        remote: Boolean(pref.remote),
      };

      // Run their saved search (upserts fresh matches; emailedAt untouched).
      await executeSearch(p.userId, profile, filters);

      // New = strong matches never emailed, not dismissed.
      const newMatches = await prisma.match.findMany({
        where: {
          userId: p.userId,
          emailedAt: null,
          score: { gte: MIN_SCORE },
          status: { not: "DISMISSED" },
        },
        include: { job: true },
        orderBy: { score: "desc" },
        take: MAX_PER_EMAIL,
      });
      if (newMatches.length === 0) continue;

      const user = await client.users.getUser(p.userId);
      const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
      if (!email) {
        errors.push(`${p.userId}: no email`);
        continue;
      }

      const lang = filters.country === "se" ? "sv" : "en";
      const unsubUrl = `${APP_URL}/api/digest/unsubscribe?u=${p.userId}&t=${unsubToken(p.userId)}`;
      const digestMatches: DigestMatch[] = newMatches.map((m) => ({
        score: m.score,
        rationale: m.rationale,
        job: { headline: m.job.headline, employer: m.job.employer, location: m.job.location, url: m.job.url },
      }));
      const { subject, html } = buildDigestEmail(digestMatches, lang, unsubUrl);

      const sent = await sendEmail(email, subject, html);
      if (!sent.ok) {
        errors.push(`${p.userId}: ${sent.error}`);
        continue;
      }

      await prisma.match.updateMany({
        where: { id: { in: newMatches.map((m) => m.id) } },
        data: { emailedAt: new Date() },
      });
      emailsSent++;
    } catch (err) {
      errors.push(`${p.userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, usersProcessed, emailsSent, errors });
}
