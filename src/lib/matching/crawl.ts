import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { jobtechAdapter } from "../sources/jobtech";
import { normalize } from "../normalize";
import { embedTexts, jobEmbedText, toVectorLiteral } from "../embeddings";
import type { RawJob } from "../sources/types";

// Phase 2b — corpus crawl. A scheduled, user-independent ingest that pulls a
// broad, representative slice of the Swedish market from Arbetsförmedlingen and
// embeds it, so the cross-run pgvector recall in `executeSearch` can surface
// good jobs that no single user's keyword search happened to fetch. This is the
// difference between "we rank what we found for you" and "we rank the whole
// market for you" — the actual moat over a plain job board.
//
// Every phase runs against ONE wall-clock deadline so the serverless function
// always returns before the platform's 60s cap (a naive version timed out). The
// crawl is re-runnable and drains its embedding backlog across successive runs,
// so nothing needs to finish in a single invocation.

// Broad occupation queries spanning Sweden's largest employment sectors. The
// goal is breadth, not precision — cast wide so the corpus mirrors the real
// labour market rather than whatever roles our users happen to search for.
const CRAWL_QUERIES = [
  "sjuksköterska", "undersköterska", "läkare", "vård", "omsorg",
  "lärare", "förskollärare", "pedagog",
  "ekonom", "redovisning", "administratör", "kundtjänst", "reception",
  "säljare", "butik", "marknadsföring",
  "systemutvecklare", "utvecklare", "IT", "data", "ingenjör", "tekniker",
  "projektledare", "chef", "ledare",
  "lager", "logistik", "chaufför", "transport",
  "bygg", "elektriker", "montör", "snickare",
  "restaurang", "kock", "städ", "personlig assistent",
  "HR", "jurist", "socionom",
];

const PER_QUERY_LIMIT = 60; // JobTech caps at 100/request; 60 keeps volume sane
const UPSERT_CHUNK = 25; // parallel DB writes per round (bounds the write phase)
const SELECT_BATCH = 32; // rows pulled per embed loop; embedTexts re-chunks to 8

// One budget for the whole invocation, well under the 60s platform cap. Fetch
// (~≤15s worst case, all in parallel) and upsert eat into it; whatever remains
// goes to embedding, which stops early enough that one throttled Voyage batch
// can't push us past the cap.
const TOTAL_BUDGET_MS = 45_000;
const EMBED_STOP_MARGIN_MS = 13_000; // stop embedding this many ms before deadline

export interface CrawlResult {
  queries: number;
  fetched: number; // unique postings returned across all queries
  upserted: number; // rows written to the Job table
  embedded: number; // jobs embedded this run
  remaining: number; // jobs still awaiting an embedding
  embedError: string | null; // set if embedding failed (ingest still counts)
}

// Fetch every crawl query IN PARALLEL and merge to unique postings by the
// source's own id. One round of parallel requests is bounded by a single fetch's
// timeout (~15s) instead of stacking sequential rounds; JobTech is a public,
// keyless API that handles the fan-out fine, and a throttled/failed query just
// contributes nothing.
async function fetchCorpus(): Promise<RawJob[]> {
  const results = await Promise.all(
    CRAWL_QUERIES.map((query) => jobtechAdapter.fetch({ query, limit: PER_QUERY_LIMIT }))
  );
  const bySourceId = new Map<string, RawJob>();
  for (const r of results) {
    if (r.status !== "ok") continue;
    for (const j of r.jobs) if (!bySourceId.has(j.sourceId)) bySourceId.set(j.sourceId, j);
  }
  return [...bySourceId.values()];
}

// Upsert normalized postings in parallel chunks. Mirrors the write in
// executeSearch so a crawled job and a searched job are indistinguishable in the
// table. New rows land with a NULL embedding and get picked up by the embed pass
// below. Stops if we blow the deadline (a huge first batch shouldn't starve the
// response) — leftovers are re-fetched next run.
async function upsertJobs(raws: RawJob[], deadline: number): Promise<number> {
  let upserted = 0;
  for (let i = 0; i < raws.length; i += UPSERT_CHUNK) {
    if (Date.now() > deadline) break;
    const chunk = raws.slice(i, i + UPSERT_CHUNK);
    await Promise.all(
      chunk.map((raw) => {
        const n = normalize(jobtechAdapter.name, raw);
        return prisma.job.upsert({
          where: { source_sourceId: { source: n.source, sourceId: n.sourceId } },
          create: n,
          update: {
            headline: n.headline,
            employer: n.employer,
            location: n.location,
            description: n.description,
            url: n.url,
            canonicalUrl: n.canonicalUrl,
            publishedAt: n.publishedAt,
            applicationDeadline: n.applicationDeadline,
            raw: n.raw,
          },
        });
      })
    );
    upserted += chunk.length;
  }
  return upserted;
}

async function countUnembedded(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>(
    Prisma.sql`SELECT count(*) AS n FROM "Job" WHERE embedding IS NULL`
  );
  return Number(rows[0]?.n ?? 0);
}

interface JobRow {
  id: string;
  headline: string;
  employer: string | null;
  location: string | null;
  description: string;
}

// Embed NULL-embedding jobs until we near the deadline, ensuring the pgvector
// extension + ANN index exist first (idempotent). Stops EMBED_STOP_MARGIN_MS
// before the deadline so an in-flight (possibly rate-limited) batch can finish
// without overshooting the platform cap. Returns how many were embedded; the
// caller reports `remaining` so a large backlog drains across successive runs.
async function embedNewJobs(deadline: number): Promise<number> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS job_embedding_hnsw ON "Job" USING hnsw (embedding vector_cosine_ops)`
  );

  let embedded = 0;
  while (Date.now() < deadline - EMBED_STOP_MARGIN_MS) {
    const rows = await prisma.$queryRaw<JobRow[]>(Prisma.sql`
      SELECT id, headline, employer, location, description
      FROM "Job"
      WHERE embedding IS NULL
      LIMIT ${SELECT_BATCH}
    `);
    if (rows.length === 0) break;

    const vecs = await embedTexts(rows.map(jobEmbedText), "document");
    await Promise.all(
      rows.map((r, i) =>
        prisma.$executeRaw(
          Prisma.sql`UPDATE "Job" SET embedding = ${toVectorLiteral(vecs[i])}::vector WHERE id = ${r.id}`
        )
      )
    );
    embedded += rows.length;
  }
  return embedded;
}

// Orchestrate one crawl: fetch the broad corpus, upsert it, then embed as much
// of the NULL-embedding backlog as the time budget allows. Ingest and embedding
// are decoupled so a Voyage outage (or missing key) still grows the corpus —
// the jobs just wait for a later run to be embedded.
export async function crawlAndEmbed(): Promise<CrawlResult> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const raws = await fetchCorpus();
  const upserted = await upsertJobs(raws, deadline);

  let embedded = 0;
  let embedError: string | null = null;
  try {
    embedded = await embedNewJobs(deadline);
  } catch (err) {
    embedError = err instanceof Error ? err.message : String(err);
  }

  const remaining = await countUnembedded();
  return {
    queries: CRAWL_QUERIES.length,
    fetched: raws.length,
    upserted,
    embedded,
    remaining,
    embedError,
  };
}
