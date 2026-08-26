import { NextRequest, NextResponse } from "next/server";
import { isValidRegionId } from "@/lib/sources/regions";
import { isValidCountry, DEFAULT_COUNTRY } from "@/lib/sources/countries";
import { previewSearch } from "@/lib/matching/runSearch";
import { rateLimit, ANON_LIMITS, clientIp } from "@/lib/rateLimit";
import type { Profile } from "@/lib/matching/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Number of top matches a signed-out visitor sees in full. The rest are returned
// as locked stubs (score only, no employer/rationale/url) so the UI can show the
// count and blur them behind a signup prompt — value shown, actions gated.
const PREVIEW_VISIBLE = 3;

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

// Coerce the client-supplied profile into a safe Profile. The client got it from
// /preview/parse, but it round-trips through the browser, so never trust it:
// clamp every field to its expected type with sane defaults.
function sanitizeProfile(raw: unknown): Profile | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  const titles = asStringArray(p.titles);
  if (titles.length === 0) return null; // titles drive the query — required
  const remotePref = ["onsite", "hybrid", "remote", "any"].includes(String(p.remotePref))
    ? (p.remotePref as Profile["remotePref"])
    : "any";
  return {
    titles: titles.slice(0, 8),
    seniority: typeof p.seniority === "string" ? p.seniority : "",
    skills: asStringArray(p.skills),
    locations: asStringArray(p.locations),
    languages: asStringArray(p.languages),
    remotePref,
    mustHaves: asStringArray(p.mustHaves),
    summary: typeof p.summary === "string" ? p.summary : "",
  };
}

// POST /api/v1/preview/run  { profile, titles?, regions?, remote?, country? }
// Anonymous preview search. Runs the full matching pipeline but persists no
// user-scoped rows, and returns only the top PREVIEW_VISIBLE matches in full —
// the remainder are locked stubs the UI blurs behind a signup prompt.
export async function POST(req: NextRequest) {
  const ipKey = `ip:${clientIp(req)}`;
  const rl = await rateLimit(ipKey, "preview_run", ANON_LIMITS.run.max, ANON_LIMITS.run.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `You've hit the free preview limit. Sign up free to keep searching, or try again in ~${rl.retryAfterMinutes} min.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const profile = sanitizeProfile(body?.profile);
  if (!profile) {
    return NextResponse.json({ error: "A parsed profile is required — parse a CV first." }, { status: 400 });
  }

  const bodyTitles = asStringArray(body?.titles);
  const regions = asStringArray(body?.regions).filter(isValidRegionId);
  const remote = Boolean(body?.remote);
  const country =
    typeof body?.country === "string" && isValidCountry(body.country) ? body.country : DEFAULT_COUNTRY;
  const titles = bodyTitles.length ? bodyTitles : profile.titles;

  const { health, warning, results } = await previewSearch(profile, {
    titles,
    regions,
    remote,
    country,
  });

  if (health.length === 0) {
    return NextResponse.json({ error: warning ?? "Nothing to search.", health, results: [], total: 0, locked: 0 }, { status: 400 });
  }
  if (health.every((h) => h.status === "error")) {
    return NextResponse.json({ error: "All sources failed to fetch.", health, results: [], total: 0, locked: 0 }, { status: 502 });
  }

  // Reveal the top few in full; return the rest as locked stubs (score only) so
  // the visitor sees how many more await behind a free signup, without leaking
  // the employer/link/rationale the signup is meant to unlock.
  const visible = results.slice(0, PREVIEW_VISIBLE);
  const lockedCount = Math.max(0, results.length - visible.length);

  return NextResponse.json({
    health,
    warning,
    total: results.length,
    locked: lockedCount,
    results: visible.map((m) => ({
      jobId: m.jobId,
      score: m.score,
      rationale: m.rationale,
      gaps: m.gaps,
      job: {
        headline: m.job.headline,
        employer: m.job.employer,
        location: m.job.location,
        url: m.job.url,
        source: m.job.source,
        applicationDeadline: m.job.applicationDeadline,
      },
    })),
    // Locked rows carry only a score, enough to render a blurred teaser card.
    lockedScores: results.slice(PREVIEW_VISIBLE).map((m) => m.score),
  });
}
