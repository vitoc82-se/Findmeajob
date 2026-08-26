import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedTexts, jobEmbedText, toVectorLiteral } from "@/lib/embeddings";
import { bearerOk } from "@/lib/secret";

export const runtime = "nodejs";
export const maxDuration = 60;

// One-time (re-runnable) maintenance endpoint: embed every Job that has no
// embedding yet, and ensure the pgvector extension + HNSW index exist. Public in
// middleware, but gated by the same CRON_SECRET bearer as the digest cron.
//
// Runs in batches within a time budget and reports how many remain, so a large
// table is handled by simply calling it again until `remaining` is 0. New jobs
// are embedded automatically at ingest, so this is only needed for the backlog.
const BATCH = 64;
const TIME_BUDGET_MS = 50_000;

interface JobRow {
  id: string;
  headline: string;
  employer: string | null;
  location: string | null;
  description: string;
}

async function countRemaining(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>(
    Prisma.sql`SELECT count(*) AS n FROM "Job" WHERE embedding IS NULL`
  );
  return Number(rows[0]?.n ?? 0);
}

export async function POST(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotent setup: extension (in case db push didn't create it) + the ANN index.
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS job_embedding_hnsw ON "Job" USING hnsw (embedding vector_cosine_ops)`
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Setup failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const start = Date.now();
  let embedded = 0;
  try {
    while (Date.now() - start < TIME_BUDGET_MS) {
      const rows = await prisma.$queryRaw<JobRow[]>(Prisma.sql`
        SELECT id, headline, employer, location, description
        FROM "Job"
        WHERE embedding IS NULL
        LIMIT ${BATCH}
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
  } catch (err) {
    return NextResponse.json(
      { error: `Embedding failed after ${embedded}: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const remaining = await countRemaining();
  return NextResponse.json({ embedded, remaining, done: remaining === 0 });
}
