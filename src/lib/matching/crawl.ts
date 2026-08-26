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
// Cost is bounded: JobTech is free/keyless, and embedding is time-budgeted and
// only ever touches jobs with a NULL embedding (new arrivals), so once the
// backlog is embedded each daily run does a small incremental slice.

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

const PER_QUERY_LIMIT = 100; // JobTech caps at 100/request
const QUERY_CONCURRENCY = 6; // be gentle on the free API
const SELECT_BATCH = 64; // rows pulled per embed loop; embedTexts re-chunks to 8
const TIME_BUDGET_MS = 50_000; // stay under the 60s function limit

export interface CrawlResult {
  queries: number;
  fetched: number; // unique postings returned across all queries
  upserted: number; // rows written to the Job table
  embedded: number; // jobs embedded this run
  remaining: number; // jobs still awaiting an embedding
  embedError: string | null; // set if embedding failed (ingest still counts)
}

// Fetch every crawl query (chunked for politeness) and merge to unique postings
// by the source's own id.
async function fetchCorpus(): Promise<RawJob[]> {
  const bySourceId = new Map<string, RawJob>();
  for (let i = 0; i < CRAWL_QUERIES.length; i += QUERY_CONCURRENCY) {
    const chunk = CRAWL_QUERIES.slice(i, i + QUERY_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((query) => jobtechAdapter.fetch({ query, limit: PER_QUERY_LIMIT }))
    );
    for (const r of results) {
      if (r.status !== "ok") continue;
      for (const j of r.jobs) if (!bySourceId.has(j.sourceId)) bySourceId.set(j.sourceId, j);
    }
  }
  return [...bySourceId.values()];
}

// Upsert normalized postings. Mirrors the write in executeSearch so a crawled
// job and a searched job are indistinguishable in the table. New rows land with
// a NULL embedding and get picked up by the embed pass below.
async function upsertJobs(raws: RawJob[]): Promise<number> {
  let upserted = 0;
  for (const raw of raws) {
    const n = normalize(jobtechAdapter.name, raw);
    await prisma.job.upsert({
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
    upserted++;
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

// Embed NULL-embedding jobs within the time budget, ensuring the pgvector
// extension + ANN index exist first (idempotent). Returns how many were embedded
// this pass; the caller reports `remaining` so a large backlog is drained across
// successive daily runs.
async function embedNewJobs(deadline: number): Promise<number> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS job_embedding_hnsw ON "Job" USING hnsw (embedding vector_cosine_ops)`
  );

  let embedded = 0;
  while (Date.now() < deadline) {
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
  const deadline = Date.now() + TIME_BUDGET_MS;

  const raws = await fetchCorpus();
  const upserted = await upsertJobs(raws);

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
