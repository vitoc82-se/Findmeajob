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
  // Region concept ids to filter to (source-specific meaning; JobTech uses
  // Swedish län taxonomy ids). Empty/undefined = no geographic filter.
  regions?: string[];
  // Only remote-flagged jobs.
  remote?: boolean;
}

export interface SourceAdapter {
  name: string;
  mode: "cursor" | "fullscan";
  // `query` is the free-text search (Phase 1). `cursor` is used by cursor-mode
  // sources in later phases. An adapter NEVER throws — it catches its own errors
  // and reports them via FetchResult.status so one bad source can't kill the run
  // (eng review F3: partial digest, not fatal).
  fetch(opts: FetchOpts): Promise<FetchResult>;
}
