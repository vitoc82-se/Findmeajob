import { anthropic, MODEL_CV_PARSE, parseJsonFromClaude } from "../anthropic";
import type { Profile } from "./types";

// CV text -> structured Profile, via Claude Sonnet.
// Throws on failure so the caller can return a clear 5xx (this runs on an
// explicit user action, so a loud failure is correct here — the user sees it).
export async function parseCv(cvText: string): Promise<Profile> {
  const trimmed = cvText.trim();
  if (!trimmed) {
    throw new Error("CV text is empty");
  }
  // Cap absurdly long inputs — a CV (+ intent) rarely needs more, and this
  // bounds token cost if someone uploads a huge document.
  const capped = trimmed.slice(0, 12000);

  const system =
    "You extract a structured job-search profile. The input may contain a CV " +
    "(work history/skills) and/or a short 'what I'm looking for' note stating the " +
    "person's DESIRED direction. When both are present, weight stated intent for " +
    "the target roles and preferences, and use the CV for skills and seniority — " +
    "a person moving into a new field wants titles for where they're going, not " +
    "only where they've been. Respond with ONLY a JSON object, no prose, no " +
    "markdown fences. Infer role titles a real employer would post. The jobs are " +
    "searched on the Swedish job market (Arbetsförmedlingen / Platsbanken), so write " +
    "each title exactly as Swedish employers word it in job ads: Swedish for trades, " +
    "healthcare, retail, logistics, admin, education and so on (e.g. \"Lagerarbetare\", " +
    "\"Truckförare\", \"Undersköterska\"), and English only where Swedish employers " +
    "themselves usually use the English title (many IT and product roles, e.g. " +
    "\"Software Engineer\"). Put the most common wording first and add close synonyms " +
    "rather than near-duplicates.";

  const levels =
    "LEVELS: junior = entry level, first jobs or under ~2 years of experience; " +
    "mid = an experienced professional doing the work independently; " +
    "senior = a specialist or expert with deep experience and NO management role (including a technical lead without a team); " +
    "lead = a manager: the person manages staff, a team, a unit or a business, or is aiming for a manager role " +
    "(chef, restaurangchef, säljchef, avdelningschef, produktionschef, ekonomichef, arbetsledare, teamledare). " +
    "If their current or desired role is a manager role, the level is lead, even if they are very experienced.";

  const schema = `{
  "titles": string[],        // 4-6 role titles as Swedish employers post them, best-first (the first four are searched)
  "seniority": string,       // the level of the roles they are AIMING for (see LEVELS): "junior" | "mid" | "senior" | "lead"
  "skills": string[],        // concrete skills/technologies
  "locations": string[],     // preferred locations, include "Remote" if applicable
  "languages": string[],
  "remotePref": string,      // "onsite" | "hybrid" | "remote" | "any"
  "mustHaves": string[],     // hard requirements stated or clearly implied
  "summary": string          // 1-2 sentence summary for a downstream re-ranker
}`;

  const msg = await anthropic().messages.create({
    model: MODEL_CV_PARSE,
    max_tokens: 1500,
    system,
    messages: [
      {
        role: "user",
        content: `${levels}\n\nExtract the profile as JSON matching this schema:\n${schema}\n\nCV:\n"""\n${capped}\n"""`,
      },
    ],
  });

  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text for CV parse");
  }

  const profile = parseJsonFromClaude<Profile>(block.text);

  // Minimal shape guard — a malformed profile would silently break the query.
  if (!Array.isArray(profile.titles) || profile.titles.length === 0) {
    throw new Error("CV parse produced no role titles");
  }
  return profile;
}
