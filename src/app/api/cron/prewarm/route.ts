import { NextRequest, NextResponse } from "next/server";
import { previewSearch, type SearchFilters } from "@/lib/matching/runSearch";
import { cacheKey, putCachedPreview } from "@/lib/matching/searchCache";
import { PREWARM_SEARCHES } from "@/lib/campaign";
import { normalizeTitle } from "@/lib/matching/titles";
import { bearerOk } from "@/lib/secret";
import type { Profile } from "@/lib/matching/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Searches run side by side in small groups (the job APIs and the AI are polite
// neighbours), and no new group starts once this much of the minute is gone.
const CHUNK = 6;
const START_DEADLINE_MS = 40_000;

// GET /api/cron/prewarm: runs each landing-page example and each campaign search
// (src/lib/campaign.ts) once, right after the daily crawl, and stores the answer. A
// visitor who taps a chip or an ad then gets results instantly. Same CRON_SECRET gate
// as the other crons.
export async function GET(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const outcomes: Array<{ title: string; region?: string; level?: string; results: number; ok: boolean }> = [];
  let skipped = 0;

  for (let i = 0; i < PREWARM_SEARCHES.length; i += CHUNK) {
    if (Date.now() - started > START_DEADLINE_MS) {
      skipped = PREWARM_SEARCHES.length - i;
      break;
    }
    const chunk = PREWARM_SEARCHES.slice(i, i + CHUNK);
    outcomes.push(
      ...(await Promise.all(
        chunk.map(async (s) => {
          // Same normalization the public endpoint applies, so the cache keys match.
          const title = normalizeTitle(s.title);
          const profile: Profile = {
            titles: [title],
            seniority: s.level ?? "",
            skills: [],
            locations: [],
            languages: [],
            remotePref: "any",
            mustHaves: [],
            summary: title,
          };
          const filters: SearchFilters = {
            titles: [title],
            regions: s.region ? [s.region] : [],
            remote: false,
            country: "se",
            lang: "sv",
          };
          try {
            const r = await previewSearch(profile, filters);
            await putCachedPreview(cacheKey([title], filters, profile.seniority), r);
            return { title, region: s.region, level: s.level, results: r.results.length, ok: !r.warning };
          } catch (err) {
            console.error("[prewarm]", title, err);
            return { title, region: s.region, level: s.level, results: 0, ok: false };
          }
        })
      ))
    );
  }
  return NextResponse.json({ ok: true, warmed: outcomes.length, skipped, outcomes });
}
