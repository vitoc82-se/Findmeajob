import type { SourceAdapter, FetchResult, RawJob } from "./types";
import { stripHtml } from "../util/html";

// Adzuna — job aggregator with a real search API. Broadens beyond Platsbanken
// (private boards, international). Needs a free key: https://developer.adzuna.com
// Country defaults to Sweden; override with ADZUNA_COUNTRY (e.g. "gb", "de").
const ADZUNA_COUNTRY = process.env.ADZUNA_COUNTRY || "se";

export function adzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

interface AdzunaResult {
  id: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url?: string;
  description?: string;
  created?: string;
}

export const adzunaAdapter: SourceAdapter = {
  name: "adzuna",
  mode: "fullscan",

  async fetch({ query, limit = 20 }): Promise<FetchResult> {
    if (!adzunaConfigured()) {
      // Should not be called when unconfigured, but guard anyway.
      return { jobs: [], status: "error", error: "Adzuna not configured" };
    }

    const url = new URL(
      `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1`
    );
    url.searchParams.set("app_id", process.env.ADZUNA_APP_ID as string);
    url.searchParams.set("app_key", process.env.ADZUNA_APP_KEY as string);
    url.searchParams.set("what", query);
    url.searchParams.set("results_per_page", String(Math.min(limit, 50)));
    url.searchParams.set("content-type", "application/json");

    try {
      const res = await fetch(url.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { jobs: [], status: "error", error: `Adzuna HTTP ${res.status}` };
      }
      const data = (await res.json()) as { results?: AdzunaResult[] };
      const hits = data.results ?? [];

      const jobs: RawJob[] = hits
        .filter((h) => h.id && h.title && h.redirect_url)
        .map((h) => ({
          sourceId: String(h.id),
          headline: h.title as string,
          employer: h.company?.display_name,
          location: h.location?.display_name,
          description: stripHtml(h.description ?? ""),
          url: h.redirect_url as string,
          canonicalUrl: h.redirect_url,
          publishedAt: h.created,
          raw: h,
        }));

      return { jobs, status: "ok" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { jobs: [], status: "error", error: `Adzuna fetch failed: ${message}` };
    }
  },
};
