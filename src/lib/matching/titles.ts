import type { Profile } from "./types";

// People type job titles the way they speak: "it chef", "ekonomi assistent". Two
// small normalizations keep that from derailing the search and the AI:
//  - a standalone "it" is the IT field, not the English pronoun ("It chef" was being
//    read as a plain "chef" and returned cooks scoring 90);
//  - the strict query form requires every word to match, so "IT chef" doesn't
//    also return every "kökschef".
export function normalizeTitle(t: string): string {
  return t.trim().replace(/\bit\b/gi, "IT").replace(/\s+/g, " ");
}

// "IT chef" -> "+IT +chef" (JobTech's "all of these words" syntax). Single words
// need no strict form.
export function strictQuery(title: string): string | null {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((w) => `+${w}`).join(" ") : null;
}

// A profile built from a typed job title alone (no CV details). The chosen level
// (seniority) is a search filter, not CV detail, so it does not disqualify it. These searches are
// generic, so they can be cached and their title can be expanded.
export function isTitleOnly(profile: Profile): boolean {
  return (
    profile.skills.length === 0 &&
    profile.mustHaves.length === 0 &&
    profile.locations.length === 0 &&
    profile.languages.length === 0
  );
}
