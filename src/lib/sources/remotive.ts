import type { SourceAdapter, FetchResult, RawJob } from "./types";
import { stripHtml } from "../util/html";

// Remotive — remote jobs, free API with a `search` param. These are the roles
// Platsbanken barely covers. Docs: https://remotive.com/api/remote-jobs
const REMOTIVE_BASE = "https://remotive.com/api/remote-jobs";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  publication_date?: string;
  description?: string;
}

// Remotive lists global remote jobs; many are region-locked (e.g. "USA"). Keep
// only ones a Sweden-based candidate could plausibly take.
function reachableFromSweden(loc: string | undefined): boolean {
  if (!loc) return true;
  const l = loc.toLowerCase();
  if (/worldwide|anywhere|europe|emea|nordic|sweden|eu\b|global/.test(l)) return true;
  // Explicit single-country locks that exclude Sweden.
  if (/usa|united states|u\.s\.|canada|uk only|india|australia|latam|apac/.test(l)) return false;
  // Unknown/other — let the re-ranker judge rather than drop it.
  return true;
}

export const remotiveAdapter: SourceAdapter = {
  name: "remotive",
  mode: "fullscan",

  async fetch({ query, limit = 20 }): Promise<FetchResult> {
    const url = new URL(REMOTIVE_BASE);
    url.searchParams.set("search", query);
    url.searchParams.set("limit", String(Math.min(limit, 50)));

    try {
      const res = await fetch(url.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { jobs: [], status: "error", error: `Remotive HTTP ${res.status}` };
      }
      const data = (await res.json()) as { jobs?: RemotiveJob[] };
      const hits = data.jobs ?? [];

      const jobs: RawJob[] = hits
        .filter((h) => h.id && h.title && h.url && reachableFromSweden(h.candidate_required_location))
        .map((h) => ({
          sourceId: String(h.id),
          headline: h.title,
          employer: h.company_name,
          location: h.candidate_required_location
            ? `Remote (${h.candidate_required_location})`
            : "Remote",
          description: stripHtml(h.description ?? ""),
          url: h.url,
          canonicalUrl: h.url,
          publishedAt: h.publication_date,
          raw: h,
        }));

      return { jobs, status: "ok" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { jobs: [], status: "error", error: `Remotive fetch failed: ${message}` };
    }
  },
};
