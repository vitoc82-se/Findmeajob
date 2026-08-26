import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { renderCvPdf, renderLetterPdf, renderTextPdf } from "@/lib/cvPdf";
import type { CvContent } from "@/lib/matching/applyAssist";

export const runtime = "nodejs"; // pdf-lib + image embedding need Node.js

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

// POST /api/v1/apply-assist/[id]/pdf?type=cv|letter → styled PDF download.
// Accepts multipart/form-data with an optional "photo" (CV only), which is
// embedded into the PDF and NEVER stored — same parse-then-discard promise as
// the CV upload. A plain JSON/empty body works too (no photo).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type") === "letter" ? "letter" : "cv";

  const doc = await prisma.applyDoc.findFirst({ where: { id, userId } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Optional headshot for the CV (multipart only) — kept in memory, never stored.
  let photo: Uint8Array | undefined;
  if (type === "cv" && (req.headers.get("content-type") || "").includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const f = form.get("photo");
      if (f instanceof File && f.size > 0) {
        if (f.size > MAX_PHOTO_BYTES) {
          return NextResponse.json({ error: "Photo too large (max 6 MB)" }, { status: 413 });
        }
        photo = new Uint8Array(await f.arrayBuffer());
      }
    } catch {
      /* no/!valid form — proceed without a photo */
    }
  }

  const cv = (doc.cvJson as unknown as CvContent | null) ?? null;

  try {
    let bytes: Uint8Array;
    let filename: string;
    if (type === "cv") {
      bytes = cv ? await renderCvPdf(cv, photo) : await renderTextPdf("CV", doc.tailoredCv);
      filename = "cv.pdf";
    } else {
      const title = doc.language === "sv" ? "Personligt brev" : "Cover letter";
      bytes = cv ? await renderLetterPdf(cv, doc.coverLetter, doc.language === "sv" ? "sv" : "en") : await renderTextPdf(title, doc.coverLetter);
      filename = "cover-letter.pdf";
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "PDF export failed", detail: message }, { status: 500 });
  }
}
