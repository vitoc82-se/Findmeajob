import { NextRequest, NextResponse } from "next/server";
import { crawlAndEmbed } from "@/lib/matching/crawl";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/cron/crawl — Phase 2b corpus crawl, invoked daily by Vercel Cron
// (see vercel.json) ahead of the digest so the day's fresh, embedded jobs are
// available to cross-run recall. Public in middleware, but gated by the same
// CRON_SECRET bearer as the digest so nobody else can trigger the work.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await crawlAndEmbed();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
