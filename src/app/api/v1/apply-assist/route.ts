import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, LIMITS } from "@/lib/rateLimit";
import { generateApplyAssist } from "@/lib/matching/applyAssist";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/v1/apply-assist?jobId=...  → { doc: ApplyDoc | null }
// Returns a previously generated tailored CV + cover letter for this job, if any.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const doc = await prisma.applyDoc.findUnique({
    where: { userId_jobId: { userId, jobId } },
  });
  return NextResponse.json({
    doc: doc
      ? { id: doc.id, tailoredCv: doc.tailoredCv, coverLetter: doc.coverLetter, language: doc.language }
      : null,
  });
}

// POST /api/v1/apply-assist  { jobId }
// Generate (or regenerate) a tailored CV + cover letter for this job.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(userId, "apply", LIMITS.apply.max, LIMITS.apply.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit reached. Try again in ~${rl.retryAfterMinutes} min.` },
      { status: 429 }
    );
  }

  let jobId: string;
  try {
    const body = await req.json();
    jobId = String(body?.jobId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile?.rawCv?.trim()) {
    return NextResponse.json({ error: "No CV on file — add your CV first." }, { status: 400 });
  }
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  try {
    const result = await generateApplyAssist(profile.rawCv, {
      headline: job.headline,
      employer: job.employer,
      location: job.location,
      description: job.description,
    });

    const cvJson = result.cv as unknown as Prisma.InputJsonValue;
    const doc = await prisma.applyDoc.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: {
        userId,
        jobId,
        tailoredCv: result.tailoredCv,
        cvJson,
        coverLetter: result.coverLetter,
        language: result.language,
      },
      update: {
        tailoredCv: result.tailoredCv,
        cvJson,
        coverLetter: result.coverLetter,
        language: result.language,
      },
    });

    return NextResponse.json({
      id: doc.id,
      tailoredCv: result.tailoredCv,
      coverLetter: result.coverLetter,
      language: result.language,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Apply-assist failed", detail: message }, { status: 500 });
  }
}
