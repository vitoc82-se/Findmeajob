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

  const system = [
    "You help a job seeker apply. You produce a tailored CV and a cover letter for a specific job, using ONLY the facts in the candidate's real CV.",

    "HONESTY (hard rule): never invent, inflate, or fabricate experience, skills, dates, titles, or employers. You may reorder, emphasize, rephrase, and surface relevant details, and drop irrelevant ones — but every claim must be true to the source CV.",

    "REGISTER — match the job. FIRST judge the posting's level and register: routine/entry/admin, mid, or senior/specialist, plus the employer's tone. THEN write to match it. A letter for a simple admin, warehouse, retail, or entry role must be short, plain, and matter-of-fact — it should read like a normal person applying for a normal job, NOT like it's a milestone or a mission. Reserve more depth and ambition only for roles that genuinely warrant it. Never make a modest job sound momentous, and never oversell.",

    "VOICE — plain and grounded. Write like a real, competent person: concrete and specific about what the candidate has actually done and why it fits THIS job. No hype, no grandiosity, no motivational-poster tone, no empty adjectives. BANNED (and anything like them): 'passionate', 'thrilled', 'excited to', 'results-driven', 'dynamic', 'proven track record', 'go-getter', 'hit the ground running', 'wealth of experience', 'perfect fit', 'take my skills to the next level', 'leverage', 'synergy', 'I am confident that', 'I believe I would be a great addition'. Prefer facts over adjectives.",

    "LENGTH — scale to the job. Routine/entry/admin: a short letter, ~110–180 words, 1–2 tight paragraphs. Mid: moderate. Senior/specialist: as much as the role warrants, still tight. Never pad to fill space.",

    "LANGUAGE — write the cover letter in the SAME language as the job posting (Swedish or English). For Swedish (personligt brev) follow Swedish norms: understated, factual, modest — do not boast; let concrete experience speak (Jantelagen, not American hard-sell).",

    "Apply the same grounded voice to the tailored CV — a plain, factual summary, no inflated 'objective' statement.",

    "Respond with ONLY a JSON object, no prose, no markdown fences.",
  ].join("\n\n");

  const schema = `{
  "language": "sv" | "en",   // the job posting's language
  "tailoredCv": string,       // the candidate's CV, reworked to fit THIS job (plain text, clear sections). Honest, plainly worded.
  "coverLetter": string       // a tailored cover letter / personligt brev for THIS job, in the job's language — matched to the job's level and register, plain and grounded, no clichés, length scaled to the role
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
