import { anthropic, MODEL_RERANK, parseJsonFromClaude } from "../anthropic";
import type { Profile, ScoredJob } from "./types";

// F2 guardrail: never LLM-score the whole feed. Rerank only the top N candidates.
// In Phase 1 (no embeddings) "top N" = the first N JobTech results, which are
// already relevance-sorted by the API. Phase 2 replaces this with embedding recall.
export const RERANK_TOP_N = 25;

export interface CandidateJob {
  jobId: string;
  headline: string;
  employer: string | null;
  location: string | null;
  description: string;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Profile x candidates -> scored, ranked list (Claude Haiku).
// Returns [] on any failure rather than throwing — a bad rerank shouldn't lose
// the whole run; the caller logs it and the user sees "0 matches, check logs".
export async function scoreJobs(
  profile: Profile,
  candidates: CandidateJob[]
): Promise<ScoredJob[]> {
  const top = candidates.slice(0, RERANK_TOP_N);
  if (top.length === 0) return [];

  const jobsForPrompt = top.map((c) => ({
    jobId: c.jobId,
    headline: c.headline,
    employer: c.employer,
    location: c.location,
    description: truncate(c.description, 1200),
  }));

  const system =
    "You are a job-match ranker. Given a candidate profile and a list of jobs, " +
    "score how well each job fits the candidate. Respond with ONLY a JSON array, " +
    "no prose, no markdown fences.";

  const instructions = `Profile:
${JSON.stringify(profile, null, 2)}

Jobs (JSON):
${JSON.stringify(jobsForPrompt)}

For EACH job return an object:
{ "jobId": string, "score": number (0-100), "rationale": string, "gaps": string }
- score: honest fit, 0-100. Be discriminating — most jobs are mediocre fits.
- rationale: ONE short sentence on why it fits (English).
- gaps: ONE short sentence on what the candidate is missing for this role, or "none".
Return a JSON array of these objects, one per job, highest score first.`;

  try {
    const msg = await anthropic().messages.create({
      model: MODEL_RERANK,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: instructions }],
    });

    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return [];

    const scored = parseJsonFromClaude<ScoredJob[]>(block.text);
    if (!Array.isArray(scored)) return [];

    // Keep only well-formed rows for jobs we actually sent.
    const validIds = new Set(top.map((c) => c.jobId));
    return scored
      .filter(
        (s) =>
          s &&
          validIds.has(s.jobId) &&
          typeof s.score === "number" &&
          s.score >= 0 &&
          s.score <= 100
      )
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}
