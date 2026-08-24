import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { extractPdfText } from "@/lib/pdf";
import { parseAndStoreProfile } from "@/lib/matching/persistProfile";
import { rateLimit, LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB — CVs are well under this
const MIN_TEXT_CHARS = 100; // below this the PDF is likely scanned (no text layer)

// POST /api/v1/parse-cv-pdf  (multipart/form-data, field "file")
// Upload -> extract text in memory -> parse -> store profile. The PDF bytes are
// NEVER written to disk or DB; only the extracted text + structured profile are
// persisted. Privacy by design: parse then discard the file.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(userId, "parse", LIMITS.parse.max, LIMITS.parse.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit reached. Try again in ~${rl.retryAfterMinutes} min.` },
      { status: 429 }
    );
  }

  let file: File | null = null;
  let intent = "";
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const i = form.get("intent");
    if (typeof i === "string") intent = i.trim();
  } catch {
    return NextResponse.json({ error: "Expected multipart form-data" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file uploaded (field 'file')" }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "PDF too large (max 6 MB)" }, { status: 413 });
  }

  try {
    // Bytes live only in this in-memory buffer for the life of the request.
    const bytes = await file.arrayBuffer();
    const text = await extractPdfText(bytes);

    if (text.length < MIN_TEXT_CHARS && !intent) {
      return NextResponse.json(
        {
          error:
            "Couldn't read text from this PDF — it may be a scanned image. Describe what you're looking for instead.",
        },
        { status: 422 }
      );
    }

    // Combine CV history with the stated intent so the profile reflects both.
    const source = intent
      ? `${text}\n\n## What I'm looking for\n${intent}`
      : text;
    const profile = await parseAndStoreProfile(userId, source);
    // `bytes` and `text` go out of scope here — nothing about the file persists.
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "PDF parse failed", detail: message },
      { status: 500 }
    );
  }
}
