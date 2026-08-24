import { anthropic, MODEL_RERANK } from "../anthropic";
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

// What the LLM returns per job — keyed by array INDEX, not the DB id. Round-tripping
// long cuids through an LLM is unreliable (it mangles them); a small integer index
// it echoes back cleanly, and we map it to the real jobId locally.
interface RankRow {
  index: number;
  score: number;
  rationale: string;
  gaps: string;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Pull the JSON array out of the model's text even if it wrapped it in prose or
// ```json fences. Throws if there is no array at all.
function extractJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`re-ranker returned no JSON array: ${truncate(text, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

// Profile x candidates -> scored, ranked list (Claude Haiku).
// THROWS on an LLM/parse failure so the caller can surface it (no silent empties).
export async function scoreJobs(
  profile: Profile,
  candidates: CandidateJob[]
): Promise<ScoredJob[]> {
  const top = candidates.slice(0, RERANK_TOP_N);
  if (top.length === 0) return [];

  // Index-keyed payload — the model never sees the cuid.
  const jobsForPrompt = top.map((c, index) => ({
    index,
    headline: c.headline,
    employer: c.employer,
    location: c.location,
    description: truncate(c.description, 900),
  }));

  const system =
    "You are a job-match ranker. Given a candidate profile and a numbered list " +
    "of jobs, score how well each job fits the candidate. Respond with ONLY a " +
    "JSON array, no prose, no markdown fences.";

  const instructions = `Profile:
${JSON.stringify(profile, null, 2)}

Jobs (JSON, each has an "index"):
${JSON.stringify(jobsForPrompt)}

For EACH job return an object keyed by its index:
{ "index": number, "score": number (0-100), "rationale": string, "gaps": string }
- score: honest fit 0-100. Be discriminating — most jobs are mediocre fits.
- rationale: ONE short sentence on why it fits (English).
- gaps: ONE short sentence on what's missing, or "none".
Return a JSON array with one object per job. Keep rationale and gaps short.`;

  const msg = await anthropic().messages.create({
    model: MODEL_RERANK,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: instructions }],
  });

  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("re-ranker returned no text");
  }

  const parsed = extractJsonArray(block.text);
  if (!Array.isArray(parsed)) {
    throw new Error("re-ranker did not return a JSON array");
  }

  const scored: ScoredJob[] = [];
  for (const row of parsed as RankRow[]) {
    const idx = row?.index;
    if (typeof idx !== "number" || idx < 0 || idx >= top.length) continue;
    if (typeof row.score !== "number" || row.score < 0 || row.score > 100) continue;
    scored.push({
      jobId: top[idx].jobId,
      score: row.score,
      rationale: row.rationale ?? "",
      gaps: row.gaps ?? "",
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}
