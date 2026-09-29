import { NextRequest, NextResponse } from "next/server";
import { previewSearch, type SearchFilters } from "@/lib/matching/runSearch";
import { cacheKey, putCachedPreview } from "@/lib/matching/searchCache";
import { EXAMPLE_QUERIES } from "@/lib/examples";
import { bearerOk } from "@/lib/secret";
import type { Profile } from "@/lib/matching/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/cron/prewarm: runs each landing-page example search (Swedish, all of
// Sweden) once, right after the daily crawl, and stores the answer. A visitor who
// taps a chip then gets results instantly. Same CRON_SECRET gate as the other crons.
export async function GET(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcomes = await Promise.all(
    EXAMPLE_QUERIES.sv.map(async (title) => {
      const profile: Profile = {
        titles: [title],
        seniority: "",
        skills: [],
        locations: [],
        languages: [],
        remotePref: "any",
        mustHaves: [],
        summary: title,
      };
      const filters: SearchFilters = { titles: [title], regions: [], remote: false, country: "se", lang: "sv" };
      try {
        const r = await previewSearch(profile, filters);
        await putCachedPreview(cacheKey([title], filters), r);
        return { title, results: r.results.length, ok: !r.warning };
      } catch (err) {
        console.error("[prewarm]", title, err);
        return { title, results: 0, ok: false };
      }
    })
  );
  return NextResponse.json({ ok: true, outcomes });
}
