// Seniority, as a small ordered scale shared by the picker, the AI scoring and the
// score adjustment. The four levels are what Swedish job ads actually distinguish:
//   junior : entry level / trainee / little or no experience needed
//   mid    : an experienced professional doing the job independently
//   senior : specialist / expert / "senior" / technical lead without a team
//   lead   : a manager: people, budget or department responsibility (chef, ledare)
export const LEVELS = ["junior", "mid", "senior", "lead"] as const;
export type Level = (typeof LEVELS)[number];

// "" = no preference: nothing is adjusted.
export function normalizeLevel(v: unknown): Level | "" {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v) ? (v as Level) : "";
}

const ORDER: Record<Level, number> = { junior: 0, mid: 1, senior: 2, lead: 3 };

// How far a job's level is from the level the person wants: 0 = same.
export function levelDistance(want: Level, job: Level): number {
  return Math.abs(ORDER[want] - ORDER[job]);
}

// Score points lost for a level mismatch. One step off is a small nudge (people do
// apply one level up or down); two or more steps off is a different job: a manager
// role for someone who wants an entry role, or the reverse.
const PENALTY_BY_DISTANCE = [0, 6, 18, 28];
export function levelPenalty(want: Level | "", job: Level | "unclear" | undefined): number {
  if (!want || !job || job === "unclear") return 0;
  return PENALTY_BY_DISTANCE[levelDistance(want, job)] ?? 28;
}
