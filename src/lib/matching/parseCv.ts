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
    "markdown fences. Infer role titles a real employer would post.";

  const schema = `{
  "titles": string[],        // 3-6 role titles this person fits, best-first
  "seniority": string,       // "junior" | "mid" | "senior" | "lead"
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
        content: `Extract the profile as JSON matching this schema:\n${schema}\n\nCV:\n"""\n${capped}\n"""`,
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
