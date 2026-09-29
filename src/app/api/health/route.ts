import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/health — verifies DB connectivity and that required keys are present.
export async function GET() {
  const checks: Record<string, boolean | string> = {
    database: false,
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  // Where the function runs and where the database lives (region only, never the
  // connection string). A mismatch shows up as slow searches, so make it visible.
  checks.functionRegion = process.env.VERCEL_REGION ?? "local";
  const host = (process.env.DATABASE_URL ?? "").match(/@([^/:?]+)/)?.[1] ?? "";
  checks.databaseRegion = host.match(/\.([a-z]{2}-[a-z]+-\d)\./)?.[1] ?? "unknown";

  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$queryRaw`SELECT 1`;
    checks.databaseRoundTripMs = String(Math.round((Date.now() - t0) / 2));
    checks.database = true;
  } catch (err) {
    checks.database = false;
    checks.databaseError = err instanceof Error ? err.message : String(err);
  }

  const ok = checks.database === true && checks.anthropicKey === true;
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
