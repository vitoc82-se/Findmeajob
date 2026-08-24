import type { SourceAdapter, FetchResult, RawJob } from "./types";

// Arbetsförmedlingen JobTech JobSearch API — free, open, no key required.
// Covers the Swedish market (aggregates Platsbanken). Phase 1's only source.
// Docs: https://jobsearch.api.jobtechdev.se/
const JOBTECH_BASE = "https://jobsearch.api.jobtechdev.se/search";

// The subset of the JobTech hit shape we read. The API returns much more; we
// keep the whole thing in `raw`.
interface JobTechHit {
  id: string;
  headline?: string;
  description?: { text?: string };
  employer?: { name?: string; url?: string };
  workplace_address?: {
    municipality?: string;
    region?: string;
    country?: string;
  };
  webpage_url?: string;
  application_details?: { url?: string };
  application_deadline?: string;
  publication_date?: string;
}

interface JobTechResponse {
  total?: { value?: number };
  hits?: JobTechHit[];
}

function locationOf(hit: JobTechHit): string | undefined {
  const a = hit.workplace_address;
  if (!a) return undefined;
  const parts = [a.municipality, a.region, a.country].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

export const jobtechAdapter: SourceAdapter = {
  name: "jobtech",
  mode: "fullscan",

  async fetch({ query, limit = 50 }): Promise<FetchResult> {
    const url = new URL(JOBTECH_BASE);
    url.searchParams.set("q", query);
    // JobTech caps limit at 100 per request.
    url.searchParams.set("limit", String(Math.min(limit, 100)));

    try {
      const res = await fetch(url.toString(), {
        headers: { accept: "application/json" },
        // Don't let a slow source hang the whole run.
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return {
          jobs: [],
          status: "error",
          error: `JobTech HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as JobTechResponse;
      const hits = data.hits ?? [];

      const jobs: RawJob[] = hits
        .filter((h) => h.id && h.headline && h.webpage_url)
        .map((h) => ({
          sourceId: h.id,
          headline: h.headline as string,
          employer: h.employer?.name,
          location: locationOf(h),
          description: h.description?.text ?? "",
          url: h.webpage_url as string,
          canonicalUrl: h.application_details?.url ?? h.webpage_url,
          publishedAt: h.publication_date,
          applicationDeadline: h.application_deadline,
          raw: h,
        }));

      return { jobs, status: "ok" };
    } catch (err) {
      // Never throw — F3: a failing source is skipped, not fatal.
      const message = err instanceof Error ? err.message : String(err);
      return { jobs: [], status: "error", error: `JobTech fetch failed: ${message}` };
    }
  },
};
