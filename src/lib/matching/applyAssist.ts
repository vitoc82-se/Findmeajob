import { anthropic, MODEL_APPLY, parseJsonFromClaude } from "../anthropic";

export interface ApplyAssistResult {
  tailoredCv: string; // plain text / light markdown
  coverLetter: string;
  language: "sv" | "en";
}

export interface ApplyAssistJob {
  headline: string;
  employer: string | null;
  location: string | null;
  description: string;
}

// Generate a tailored CV + cover letter for ONE job from the user's stored CV.
// HONESTY is enforced: emphasize/reorder/rephrase only what is truly in the CV,
// never invent experience. The cover letter is written in the job's language.
export async function generateApplyAssist(
  cvText: string,
  job: ApplyAssistJob
): Promise<ApplyAssistResult> {
  if (!cvText.trim()) throw new Error("No CV on file to tailor");

  const system =
    "You help a job seeker apply. You produce a tailored CV and a cover letter for a " +
    "specific job, using ONLY the facts in the candidate's real CV. HARD RULE: never " +
    "invent, inflate, or fabricate experience, skills, dates, titles, or employers. You " +
    "may reorder, emphasize, rephrase, and surface relevant details, and drop irrelevant " +
    "ones — but every claim must be true to the source CV. Write the cover letter in the " +
    "SAME language as the job posting (Swedish or English). Respond with ONLY a JSON " +
    "object, no prose, no markdown fences.";

  const schema = `{
  "language": "sv" | "en",   // the job posting's language
  "tailoredCv": string,       // the candidate's CV, reworked to fit THIS job (plain text, clear sections). Honest.
  "coverLetter": string       // a tailored cover letter / personligt brev for THIS job, in the job's language
}`;

  const content = `Job:
Title: ${job.headline}
Employer: ${job.employer ?? "(unknown)"}
Location: ${job.location ?? "(unknown)"}
Description:
"""
${job.description.slice(0, 6000)}
"""

Candidate's real CV:
"""
${cvText.slice(0, 12000)}
"""

Return JSON matching this schema:
${schema}`;

  const msg = await anthropic().messages.create({
    model: MODEL_APPLY,
    max_tokens: 3500,
    system,
    messages: [{ role: "user", content }],
  });

  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Apply-assist returned no text");

  const parsed = parseJsonFromClaude<ApplyAssistResult>(block.text);
  if (!parsed.tailoredCv || !parsed.coverLetter) {
    throw new Error("Apply-assist output incomplete");
  }
  return {
    tailoredCv: parsed.tailoredCv,
    coverLetter: parsed.coverLetter,
    language: parsed.language === "sv" ? "sv" : "en",
  };
}
