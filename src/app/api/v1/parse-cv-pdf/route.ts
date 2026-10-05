import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { extractPdfText } from "@/lib/pdf";
import { parseAndStoreProfile } from "@/lib/matching/persistProfile";
import { rateLimit, LIMITS, PAUSED_MESSAGE } from "@/lib/rateLimit";

export const runtime = "nodejs";
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB — CVs are well under this
const MIN_TEXT_CHARS = 100; // below this the PDF is likely scanned (no text layer)

// POST /api/v1/parse-cv-pdf  (multipart/form-data, field "file")
// Upload -> extract text in memory -> parse -> store profile. The PDF bytes are
// NEVER written to disk or DB; only the extracted text + structured profile are
// persisted. Privacy by design: parse then discard the file.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Du behöver logga in först." }, { status: 401 });

  const rl = await rateLimit(userId, "parse", LIMITS.parse.max, LIMITS.parse.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: rl.global ? PAUSED_MESSAGE : `Du har gjort för många försök på kort tid. Vänta ungefär ${rl.retryAfterMinutes} minuter och försök igen.` },
      { status: rl.global ? 503 : 429 }
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
    return NextResponse.json({ error: "Något gick fel med filen. Försök igen." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "Du har inte valt någon fil." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Just nu fungerar bara PDF-filer." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Filen är för stor. Max 6 MB." }, { status: 413 });
  }

  try {
    // Bytes live only in this in-memory buffer for the life of the request.
    const bytes = await file.arrayBuffer();
    const text = await extractPdfText(bytes);

    if (text.length < MIN_TEXT_CHARS && !intent) {
      return NextResponse.json(
        {
          error:
            "Vi hittar ingen text i den här PDF:en. Den kanske är en inskannad bild. Skriv istället vad du söker för jobb.",
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
    // Detail stays in the server log; the client only gets a plain message.
    console.error("[parse-cv-pdf]", err);
    return NextResponse.json(
      { error: "Vi kunde inte läsa PDF:en. Försök igen, eller klistra in texten istället." },
      { status: 500 }
    );
  }
}
