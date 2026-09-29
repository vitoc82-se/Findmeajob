import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { anthropic, MODEL_RERANK } from "../anthropic";

// A typed title is often narrower than the market: "IT chef" has no exact match in
// many regions, but "IT-ansvarig", "IT-samordnare" or "Projektledare IT" are jobs
// the same person could take. Ask the fast model for the neighbouring titles that
// Swedish employers actually use, then search for those too. The answers are cached
// for a month, so a given title costs one small call ever.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EXTRA = 4;

const keyFor = (title: string) =>
  "expand:" + createHash("sha256").update(title.trim().toLowerCase()).digest("hex");

async function fromCache(key: string): Promise<string[] | null> {
  try {
    const row = await prisma.searchCache.findUnique({ where: { key } });
    if (!row || Date.now() - row.createdAt.getTime() > TTL_MS) return null;
    const v = row.payload as unknown as { titles?: unknown };
    return Array.isArray(v?.titles) ? v.titles.filter((t): t is string => typeof t === "string") : null;
  } catch {
    return null;
  }
}

async function toCache(key: string, titles: string[]): Promise<void> {
  try {
    const payload = { titles } as unknown as Prisma.InputJsonValue;
    await prisma.searchCache.upsert({
      where: { key },
      create: { key, payload },
      update: { payload, createdAt: new Date() },
    });
  } catch (err) {
    console.error("[expand-titles] cache write failed:", err);
  }
}

// Returns the original title first, then up to MAX_EXTRA related ones. Never throws:
// on any failure the search simply runs on the original title.
export async function expandTitle(title: string): Promise<string[]> {
  const key = keyFor(title);
  const cached = await fromCache(key);
  if (cached) return [title, ...cached].slice(0, 1 + MAX_EXTRA);

  try {
    const msg = await anthropic().messages.create(
      {
        model: MODEL_RERANK,
        max_tokens: 300,
        system:
          "You help a job search on the Swedish job market (Arbetsförmedlingen / Platsbanken). " +
          "Given a job title someone typed, list the neighbouring job titles that Swedish employers " +
          "actually put in ads: real synonyms, and close roles a person in this job could also take " +
          "(one step up or down in seniority, or a neighbouring specialisation). Most similar first. " +
          "Use Swedish wording (English only where Swedish employers usually use the English title). " +
          "Never repeat the input, and never list a different occupation.",
        tools: [
          {
            name: "submit_titles",
            description: "Submit the related job titles.",
            input_schema: {
              type: "object",
              properties: { titles: { type: "array", items: { type: "string" }, maxItems: MAX_EXTRA } },
              required: ["titles"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "submit_titles" },
        messages: [{ role: "user", content: `Job title: ${title}` }],
      },
      { timeout: 8000 }
    );
    const tool = msg.content.find((b) => b.type === "tool_use");
    const raw = tool && tool.type === "tool_use" ? (tool.input as { titles?: unknown }).titles : [];
    const seen = new Set([title.trim().toLowerCase()]);
    const extra: string[] = [];
    for (const t of Array.isArray(raw) ? raw : []) {
      if (typeof t !== "string") continue;
      const clean = t.trim().slice(0, 60);
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        extra.push(clean);
      }
    }
    const limited = extra.slice(0, MAX_EXTRA);
    if (limited.length > 0) await toCache(key, limited);
    return [title, ...limited];
  } catch (err) {
    console.error("[expand-titles] failed, using the typed title only:", err);
    return [title];
  }
}
