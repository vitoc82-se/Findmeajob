import { SWEDISH_REGIONS } from "../sources/regions";

// Deterministic location weighting.
//
// The LLM reranker (scoreJobs) scores skills/role fit ONLY — it is never told
// which region the search narrowed to, and geography is a factual thing it
// judges inconsistently anyway. So we adjust its score here, from the search's
// own region selection. Effect: an in-region job outranks an equally- (or
// slightly-better-) fit job 1000km away, WITHOUT hiding the far one — it just
// ranks lower. (Product decision 2026-08-26: show out-of-region, ranked down.)

// Tuned so a near-perfect in-region job beats a strong-fit far one, but a truly
// great far job can still outrank a mediocre near one:
//   in-region 80 → 88 beats out-of-region 85 → 70
//   in-region 60 → 68 still loses to out-of-region 95 → 80
export const IN_REGION_BONUS = 8;
export const OUT_OF_REGION_PENALTY = 15;

// län label → a lowercased stem to substring-match against a job's location
// string. Both the JobTech and JobLinks adapters build location as
// "<municipality>, <region>, <country>", and <region> is the län name
// (e.g. "Stockholms län"), so the stem "stockholms" reliably appears for
// in-region jobs. Stripping " län" also tolerates the odd API record that omits
// the suffix.
function regionStem(label: string): string {
  return label.toLowerCase().replace(/\slän$/, "").trim();
}

const SWEDISH_REGION_STEMS = SWEDISH_REGIONS.map((r) => regionStem(r.label));

// Map the taxonomy ids the UI sends back to their matchable stems.
export function regionStemsFromIds(regionIds: string[]): string[] {
  const byId = new Map(SWEDISH_REGIONS.map((r) => [r.id, r.label] as const));
  const stems: string[] = [];
  for (const id of regionIds) {
    const label = byId.get(id);
    if (label) stems.push(regionStem(label));
  }
  return stems;
}

export type LocationFit = "in" | "out" | "unknown";

// Where does this job sit relative to the selected regions?
//   "in"      — its location names one of the selected län
//   "out"     — its location names a Swedish län, but not a selected one
//   "unknown" — no län in the location (remote, "Sverige" only, foreign, empty);
//               left neutral so we never penalize a job we can't place.
export function locationFit(
  jobLocation: string | null | undefined,
  selectedStems: string[]
): LocationFit {
  if (selectedStems.length === 0) return "unknown"; // no region filter → nothing to weigh
  const loc = (jobLocation ?? "").toLowerCase();
  if (!loc) return "unknown";
  if (selectedStems.some((s) => loc.includes(s))) return "in";
  if (SWEDISH_REGION_STEMS.some((s) => loc.includes(s))) return "out";
  return "unknown";
}
