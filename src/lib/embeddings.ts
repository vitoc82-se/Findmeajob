// Voyage AI embeddings — one provider, one model, 1024 dims (matches the
// vector(1024) column on Job). Anthropic doesn't do embeddings; Voyage is their
// recommended provider and strong on multilingual (Swedish <-> English CVs/ads).
// Docs: https://docs.voyageai.com/reference/embeddings-api
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const EMBED_MODEL = "voyage-3.5";
export const EMBED_DIMS = 1024;

// Voyage caps a request at 128 inputs; we stay under and trim each text so a
// batch never blows the per-request token ceiling.
const MAX_BATCH = 64;

function voyageKey(): string {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error("VOYAGE_API_KEY is not set");
  return k;
}

// input_type lets Voyage embed a search "query" (the profile) and stored
// "document"s (jobs) into a shared space tuned for retrieval.
type InputType = "query" | "document";

async function embedBatch(texts: string[], inputType: InputType): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${voyageKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
      model: EMBED_MODEL,
      input_type: inputType,
      truncation: true, // backstop: silently trim any input over the model limit
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    data?: { embedding: number[]; index: number }[];
  };
  const rows = data.data ?? [];
  if (rows.length !== texts.length) {
    throw new Error(`Voyage returned ${rows.length} embeddings for ${texts.length} inputs`);
  }
  // Voyage echoes an index per row; sort by it before stripping so vectors line
  // up with the inputs regardless of response order.
  return rows.sort((a, b) => a.index - b.index).map((r) => r.embedding);
}

export async function embedTexts(texts: string[], inputType: InputType): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + MAX_BATCH), inputType)));
  }
  return out;
}

// Cosine similarity in [-1, 1]. Used to rank this run's candidates in memory
// (the cross-run recall does the same comparison in SQL via pgvector's `<=>`).
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// pgvector literal: '[0.1,0.2,...]'. Bound as a text param and cast `::vector` in
// raw SQL, because Prisma can't set/read Unsupported("vector") columns typed.
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

// The text we embed for a job: identity + a trimmed slice of the description
// (the tail rarely changes the match and drives token cost).
export function jobEmbedText(j: {
  headline: string;
  employer?: string | null;
  location?: string | null;
  description: string;
}): string {
  return [j.headline, j.employer, j.location, (j.description ?? "").slice(0, 1500)]
    .filter(Boolean)
    .join("\n");
}

// The text we embed for the candidate profile — the retrieval "query".
export function profileEmbedText(p: {
  titles: string[];
  seniority: string;
  skills: string[];
  summary: string;
}): string {
  return [
    `Roles: ${p.titles.join(", ")}`,
    `Seniority: ${p.seniority}`,
    `Skills: ${p.skills.join(", ")}`,
    p.summary,
  ]
    .filter(Boolean)
    .join("\n");
}
