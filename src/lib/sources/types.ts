// The one interface every job source implements. Nothing outside an adapter
// knows source-specific quirks — this is the DRY boundary (eng review F-adapter).

// Raw shape a source returns. Deliberately loose — each adapter maps its own
// payload into this, then lib/normalize.ts turns it into a Job.
export interface RawJob {
  sourceId: string;
  headline: string;
  employer?: string;
  location?: string;
  description: string;
  url: string;
  canonicalUrl?: string;
  publishedAt?: string; // ISO string
  applicationDeadline?: string; // ISO string
  raw: unknown; // original payload, preserved for debugging/reprocessing
}

export type FetchStatus = "ok" | "error";

export interface FetchResult {
  jobs: RawJob[];
  status: FetchStatus;
  error?: string;
  // Cursor sources return the next cursor; full-scan sources leave it undefined.
  nextCursor?: string;
}

export interface FetchOpts {
  query: string;
  limit?: number;
  cursor?: string;
  // ISO country code for the search market (e.g. "se", "it"). Used by
  // country-scoped sources like Adzuna; ignored by inherently-single-market
  // sources (JobTech = Sweden) and by remote sources.
  country?: string;
  // Region concept ids to filter to (source-specific meaning; JobTech uses
  // Swedish län taxonomy ids). Empty/undefined = no geographic filter.
  regions?: string[];
  // Only remote-flagged jobs.
  remote?: boolean;
}

export interface SourceAdapter {
  name: string;
  mode: "cursor" | "fullscan";
  // Whether this source serves jobs for the given market. JobTech only covers
  // "se"; Adzuna covers its supported-country list; remote sources cover any.
  // The run route uses this to pick sources per the user's chosen country.
  covers(country: string): boolean;
  // `query` is the free-text search. An adapter NEVER throws — it catches its
  // own errors and reports them via FetchResult.status so one bad source can't
  // kill the run (eng review F3: partial digest, not fatal).
  fetch(opts: FetchOpts): Promise<FetchResult>;
}
