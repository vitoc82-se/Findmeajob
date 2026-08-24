import type { SourceAdapter, FetchResult, RawJob } from "./types";

// JobTech "JobAd Links" (JobLinks) — a SEPARATE JobTech API from JobSearch.
// It aggregates ad links from across Swedish job sites (company pages, other
// boards), not only Platsbanken, so it catches postings JobSearch misses.
// Overlap with JobSearch is handled by the cross-source dedup.
// Docs: https://links.api.jobtechdev.se/
const JOBLINKS_BASE = "https://links.api.jobtechdev.se/joblinks";

interface Address {
  municipality?: string;
  region?: string;
  country?: string;
}

interface JobLinksHit {
  id: string;
  headline?: string;
  brief?: string;
  employer?: { name?: string };
  workplace_addresses?: Address[];
  publication_date?: string;
  source_links?: { label?: string; url?: string }[];
}

function locationOf(hit: JobLinksHit): string | undefined {
  const a = hit.workplace_addresses?.[0];
  if (!a) return undefined;
  const parts = [a.municipality, a.region, a.country].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

export const joblinksAdapter: SourceAdapter = {
  name: "joblinks",
  mode: "fullscan",

  // Swedish market — same taxonomy world as Platsbanken.
  covers: (country) => country === "se",

  async fetch({ query, limit = 20 }): Promise<FetchResult> {
    const url = new URL(JOBLINKS_BASE);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(Math.min(limit, 100)));

    try {
      const res = await fetch(url.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { jobs: [], status: "error", error: `JobLinks HTTP ${res.status}` };
      }
      const data = (await res.json()) as { hits?: JobLinksHit[] };
      const hits = data.hits ?? [];

      const jobs: RawJob[] = [];
      for (const h of hits) {
        const link = h.source_links?.[0]?.url;
        if (!h.id || !h.headline || !link) continue;
        jobs.push({
          sourceId: h.id,
          headline: h.headline,
          employer: h.employer?.name,
          location: locationOf(h),
          description: h.brief ?? "",
          url: link,
          canonicalUrl: link,
          publishedAt: h.publication_date,
          raw: h,
        });
      }

      return { jobs, status: "ok" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { jobs: [], status: "error", error: `JobLinks fetch failed: ${message}` };
    }
  },
};
