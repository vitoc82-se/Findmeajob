// Voyage AI reranker: a cross-encoder that reads the query and each document
// together and scores how relevant the document is. Far more precise than comparing
// two independent embeddings, and one call scores a whole shortlist in well under a
// second. Docs: https://docs.voyageai.com/reference/reranker-api
const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
export const RERANK_MODEL = "rerank-2.5";

export interface RerankHit {
  index: number;
  relevance_score: number; // roughly 0-1
}

// Returns one score per document (same order as `documents`), or throws.
export async function voyageRerank(query: string, documents: string[], model: string = RERANK_MODEL): Promise<number[]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  if (documents.length === 0) return [];
  const res = await fetch(VOYAGE_RERANK_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ query, documents, model, truncation: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Voyage rerank HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as { data?: RerankHit[] };
  const scores = new Array<number>(documents.length).fill(0);
  for (const h of data.data ?? []) if (h.index >= 0 && h.index < scores.length) scores[h.index] = h.relevance_score;
  return scores;
}
