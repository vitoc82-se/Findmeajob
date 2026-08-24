import Anthropic from "@anthropic-ai/sdk";

// Single shared Anthropic client. Reuses the same ANTHROPIC_API_KEY as GrantFinder.
// Model choices (same split as GrantFinder):
//   - Sonnet for CV parsing (structure extraction, higher quality)
//   - Haiku for job re-ranking (cheap, high-volume)
export const MODEL_CV_PARSE = "claude-sonnet-4-6";
export const MODEL_RERANK = "claude-haiku-4-5-20251001";

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
