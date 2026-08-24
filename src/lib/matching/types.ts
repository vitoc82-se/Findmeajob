// The structured profile the LLM extracts from a CV, and the scored output.

export interface Profile {
  // A few role titles the person is a fit for — these drive the JobTech query.
  titles: string[];
  seniority: string; // e.g. "junior" | "mid" | "senior" | "lead"
  skills: string[];
  locations: string[]; // preferred locations, e.g. ["Stockholm", "Remote"]
  languages: string[];
  remotePref: "onsite" | "hybrid" | "remote" | "any";
  mustHaves: string[]; // hard requirements the person stated or implied
  summary: string; // 1-2 sentence profile summary for the re-ranker
}

export interface ScoredJob {
  jobId: string;
  score: number; // 0-100
  rationale: string; // one line: why it fits
  gaps: string; // what's missing for this candidate
}
