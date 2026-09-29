import { NextRequest, NextResponse } from "next/server";
import { isValidRegionId } from "@/lib/sources/regions";
import { isValidCountry, DEFAULT_COUNTRY } from "@/lib/sources/countries";
import { previewSearch, type SearchFilters } from "@/lib/matching/runSearch";
import { cacheKey, getCachedPreview, isTitleOnly, putCachedPreview } from "@/lib/matching/searchCache";
import { rateLimit, ANON_LIMITS, clientIp } from "@/lib/rateLimit";
import { normalizeTitle } from "@/lib/matching/titles";
import { normalizeLevel } from "@/lib/matching/levels";
import { createHash } from "node:crypto";
import type { Profile } from "@/lib/matching/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Research mode: a request carrying the secret in x-eval-key gets every candidate
// with all its ranking signals back, and skips the rate limit and the cache. Only the
// hash of the key is in the code, so the key itself cannot be read from it.
const EVAL_KEY_SHA256 = "1e5349676915ac4184d56027b6f6277ad23ae63e702f6d85ee075c20611d570a";
function isEval(req: NextRequest): boolean {
  const k = req.headers.get("x-eval-key");
  return !!k && createHash("sha256").update(k).digest("hex") === EVAL_KEY_SHA256;
}

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
    seniority: normalizeLevel(p.seniority),
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
  const body = await req.json().catch(() => ({}));
  const profile = sanitizeProfile(body?.profile);
  if (!profile) {
    return NextResponse.json({ error: "Skriv vilket jobb du söker." }, { status: 400 });
  }

  // Fix typed-title quirks ("It chef" -> "IT chef") before anything else sees them.
  profile.titles = profile.titles.map(normalizeTitle);
  if (isTitleOnly(profile)) profile.summary = normalizeTitle(profile.summary);
  const bodyTitles = asStringArray(body?.titles).map(normalizeTitle);
  const regions = asStringArray(body?.regions).filter(isValidRegionId);
  const remote = Boolean(body?.remote);
  const country =
    typeof body?.country === "string" && isValidCountry(body.country) ? body.country : DEFAULT_COUNTRY;
  const titles = bodyTitles.length ? bodyTitles : profile.titles;
  const lang = body?.lang === "en" ? "en" : "sv";

  const started = Date.now();
  const evalMode = isEval(req);
  const filters: SearchFilters = {
    titles,
    regions,
    remote,
    country,
    lang,
    ...(evalMode ? { debug: { pool: Math.min(80, Number(body?.pool) || 60) } } : {}),
  };

  // Title-only searches repeat constantly (landing chips, ad traffic): answer from
  // the cache when we can, and store fresh answers for the next visitor.
  const cacheable = isTitleOnly(profile) && !evalMode;
  const key = cacheable ? cacheKey(titles, filters, profile.seniority) : "";
  const cached = cacheable ? await getCachedPreview(key) : null;

  let health, warning, results, timings, debug;
  if (cached) {
    // A cache hit costs us nothing, so it doesn't count against the visitor's limit.
    ({ health, warning, results } = cached);
    timings = { cache: Date.now() - started };
  } else {
    const ipKey = `ip:${clientIp(req)}`;
    const rl = evalMode ? { ok: true, retryAfterMinutes: 0 } : await rateLimit(ipKey, "preview_run", ANON_LIMITS.run.max, ANON_LIMITS.run.windowMs);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Du har testat en hel del nu. Skapa ett gratis konto för att fortsätta, eller vänta ungefär ${rl.retryAfterMinutes} minuter.` },
        { status: 429 }
      );
    }

    ({ health, warning, results, timings, debug } = await previewSearch(profile, filters));
    if (cacheable) await putCachedPreview(key, { health, warning, results });
  }

  if (health.length === 0) {
    return NextResponse.json({ error: "Det finns inget att söka på än.", health, results: [], total: 0, locked: 0 }, { status: 400 });
  }
  if (health.every((h) => h.status === "error")) {
    return NextResponse.json({ error: "Jobbsidorna svarar inte just nu. Försök igen om en minut.", health, results: [], total: 0, locked: 0 }, { status: 502 });
  }

  // Reveal the top few in full; return the rest as locked stubs (score only) so
  // the visitor sees how many more await behind a free signup, without leaking
  // the employer/link/rationale the signup is meant to unlock.
  const visible = results.slice(0, PREVIEW_VISIBLE);
  const lockedCount = Math.max(0, results.length - visible.length);

  const serverTiming = Object.entries({ ...timings, total: Date.now() - started })
    .map(([k, v]) => `${k};dur=${v}`)
    .join(", ");

  return NextResponse.json({
    ...(evalMode ? { debug } : {}),
    health,
    warning,
    total: results.length,
    locked: lockedCount,
    results: visible.map((m) => ({
      jobId: m.jobId,
      score: m.score,
      rationale: m.rationale,
      gaps: m.gaps,
      level: m.level,
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
  }, { headers: { "Server-Timing": serverTiming } });
}
