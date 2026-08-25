import Anthropic from "@anthropic-ai/sdk";

// Single shared Anthropic client. Reuses the same ANTHROPIC_API_KEY as GrantFinder.
// Both calls run on Haiku for cost. CV parsing is structured extraction, which
// Haiku handles well — Sonnet's extra quality isn't worth ~4x the price here.
// (If parse quality ever disappoints, switch MODEL_CV_PARSE back to
// "claude-sonnet-4-6".)
export const MODEL_CV_PARSE = "claude-haiku-4-5-20251001";
export const MODEL_RERANK = "claude-haiku-4-5-20251001";
// Apply-assist (tailored CV + cover letter) is the quality/"wow" feature and the
// eventual paid one — worth Sonnet. Lower frequency than search, so cost is fine.
export const MODEL_APPLY = "claude-sonnet-4-6";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Claude sometimes wraps JSON in ```json fences. Strip them before JSON.parse.
// (GrantFinder hit silent parse failures without this.)
export function parseJsonFromClaude<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
