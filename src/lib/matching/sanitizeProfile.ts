import { normalizeLevel } from "./levels";
import type { Profile } from "./types";

export const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

// Coerce the client-supplied profile into a safe Profile. The client got it from
// /preview/parse, but it round-trips through the browser, so never trust it:
// clamp every field to its expected type with sane defaults.
export function sanitizeProfile(raw: unknown): Profile | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  const titles = asStringArray(p.titles);
  if (titles.length === 0) return null; // titles drive the query — required
  const remotePref = ["onsite", "hybrid", "remote", "any"].includes(String(p.remotePref))
    ? (p.remotePref as Profile["remotePref"])
    : "any";
  return {
    titles: titles.slice(0, 8),
    seniority: normalizeLevel(p.seniority),
    skills: asStringArray(p.skills),
    locations: asStringArray(p.locations),
    languages: asStringArray(p.languages),
    remotePref,
    mustHaves: asStringArray(p.mustHaves),
    summary: typeof p.summary === "string" ? p.summary : "",
  };
}
