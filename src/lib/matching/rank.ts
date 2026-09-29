import type { Profile } from "./types";
import type { CandidateJob } from "./scoreJobs";
import type { JobFeatures } from "./features";
import type { Level } from "./levels";

// The ranking signals and how they combine.
//
// Measured on a hand-labelled benchmark (40 searches + 14 CV personas), a
// cross-encoder reranker on its own ranked better than embeddings alone (nDCG@10
// 0.956 vs 0.925) and better than the LLM alone (0.946); a blend of the three, with
// the cross-encoder dominant, beat all of them (0.970). The LLM stays in the loop for
// what only it can do (is this the same occupation? what level is the ad? and the
// sentence explaining why), but it now only reads the shortlist.

// How many candidates go to the cross-encoder, and how many of those the LLM reads.
export const POOL_SIZE = 70;
export const LLM_SHORTLIST = 15;

// Blend weights, on 0-100 inputs. They sum to 1.25, so a blended score tops out
// around 115 before the calibration below.
export const W_RR = 0.75;
export const W_LLM = 0.25;
export const W_SIM = 0.25;
export const NOT_SAME_OCCUPATION_PENALTY = 30;

// A job the LLM did not read still needs an LLM-equivalent score. Across 1,868 scored
// jobs the LLM's score followed the reranker's closely (llm ~= 29 + 0.62 * rr).
export function imputeLlm(rr100: number): number {
  return 29 + 0.62 * rr100;
}

// Text the cross-encoder compares: the person (or the typed title) against each job.
export function rerankQuery(profile: Profile): string {
  const level = profile.seniority ? ` (${profile.seniority})` : "";
  if (profile.skills.length === 0) return `Jobb som ${profile.titles[0]}${level}`;
  return `${profile.titles.join(", ")}${level}. ${profile.summary} Färdigheter: ${profile.skills.slice(0, 12).join(", ")}`;
}

export function rerankDoc(c: CandidateJob): string {
  return [c.headline, c.employer, c.feat?.group, c.description.slice(0, 700)].filter(Boolean).join("\n");
}

// Blend the signals into one number (roughly 0-115).
export function blend(p: { rr100?: number; llm?: number; sim100?: number }): number {
  const hasRr = p.rr100 !== undefined;
  const llm = p.llm ?? (hasRr ? imputeLlm(p.rr100!) : 0);
  return (hasRr ? W_RR * p.rr100! : 0) + (hasRr ? W_LLM : 1) * llm + W_SIM * (p.sim100 ?? 0);
}

// Map a blended score to the 0-100 number people see, calibrated against the labelled
// data so the number means the same thing every time:
//   90+ : very likely a strong match (about 9 in 10 were)
//   70-89: a good match
//   50-69: plausible, worth a look
//   <50 : weak
const CALIBRATION: Array<[number, number]> = [
  [0, 3],
  [20, 10],
  [40, 25],
  [65, 50],
  [85, 70],
  [100, 85],
  [115, 97],
];
export function displayScore(s: number): number {
  if (s <= CALIBRATION[0][0]) return CALIBRATION[0][1];
  for (let i = 1; i < CALIBRATION.length; i++) {
    const [x1, y1] = CALIBRATION[i];
    const [x0, y0] = CALIBRATION[i - 1];
    if (s <= x1) return Math.round(y0 + ((s - x0) / (x1 - x0)) * (y1 - y0));
  }
  return 99;
}

// A level guess from the ad's own structured data and title, for jobs the LLM did not
// read. Only confident signals: anything uncertain is "unclear" (no adjustment).
export function structuralLevel(feat: JobFeatures | undefined, headline: string): Level | "unclear" {
  if (feat?.ssyk && feat.ssyk.startsWith("1")) return "lead"; // SSYK 1xxx = managers
  const h = headline.toLowerCase();
  if (/\b(chef|head of|director|manager|ledare|föreståndare)\b/.test(h) && !/\b(assistent|biträdande)\b/.test(h)) return "lead";
  if (/\b(junior|trainee|praktik|lia|nyexaminerad|entry level|traineeprogram)\b/.test(h)) return "junior";
  if (/\b(senior|sr|principal|expert|specialist)\b/.test(h)) return "senior";
  return "unclear";
}
