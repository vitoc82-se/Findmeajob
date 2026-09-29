import { SWEDISH_REGIONS } from "../sources/regions";

// Deterministic location weighting.
//
// The LLM reranker (scoreJobs) scores skills/role fit ONLY — it is never told
// which region the search narrowed to, and geography is a factual thing it
// judges inconsistently anyway. So we adjust its score here, from the search's
// own region selection. Effect: an in-region job outranks an equally- (or
// slightly-better-) fit job 1000km away, WITHOUT hiding the far one — it just
// ranks lower. (Product decision 2026-08-26: show out-of-region, ranked down.)

// When the visitor picks a region, WHERE the job is matters as much as how well it
// fits. Tuned so the list behaves like tiers without hiding anything:
//   in-region   80 -> 88   (small bonus)
//   unknown     85 -> 75   (the ad names no place, so we can't promise it's near)
//   out-of-reg  95 -> 65   (a great far job still shows, but below a decent near one)
// A near-perfect far job (100 -> 70) therefore still loses to any in-region job
// scoring 62+ (62 + 8 = 70), which is the point.
export const IN_REGION_BONUS = 8;
export const UNKNOWN_LOCATION_PENALTY = 10;
export const OUT_OF_REGION_PENALTY = 30;

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
