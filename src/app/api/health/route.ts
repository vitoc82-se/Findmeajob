import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/health — verifies DB connectivity and that required keys are present.
export async function GET() {
  const checks: Record<string, boolean | string> = {
    database: false,
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (err) {
    checks.database = false;
    checks.databaseError = err instanceof Error ? err.message : String(err);
  }

  const ok = checks.database === true && checks.anthropicKey === true;
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
