import { NextRequest, NextResponse } from "next/server";
import { parseCv } from "@/lib/matching/parseCv";
import { extractPdfText } from "@/lib/pdf";
import { anonRateLimit, PAUSED_MESSAGE } from "@/lib/rateLimit";

// Anthropic + pdf parsing need the Node.js runtime (not edge).
export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB — CVs are well under this
const MIN_TEXT_CHARS = 100; // below this the PDF is likely scanned (no text layer)

// POST /api/v1/preview/parse — anonymous "try before signup" CV parse.
// Accepts JSON { cvText } OR multipart form-data (field "file" + optional
// "intent"). Parses in memory and returns the structured profile WITHOUT
// storing anything — no Profile row, and the uploaded PDF's bytes never leave
// the request. IP rate-limited because it's public and costs an LLM call.
export async function POST(req: NextRequest) {
  const rl = await anonRateLimit(req, "preview_parse");
  if (!rl.ok) {
    return NextResponse.json(
      { error: rl.global ? PAUSED_MESSAGE : `Du har testat en hel del nu. Skapa ett gratis konto för att fortsätta, eller vänta ungefär ${rl.retryAfterMinutes} minuter.` },
      { status: rl.global ? 503 : 429 }
    );
  }

  const contentType = req.headers.get("content-type") || "";

  try {
    let source: string;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file");
      const intentRaw = form.get("intent");
      const intent = typeof intentRaw === "string" ? intentRaw.trim() : "";

      if (!(f instanceof File)) {
        return NextResponse.json({ error: "Du har inte valt någon fil." }, { status: 400 });
      }
      if (f.type && f.type !== "application/pdf") {
        return NextResponse.json({ error: "Just nu fungerar bara PDF-filer." }, { status: 415 });
      }
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ error: "Filen är för stor. Max 6 MB." }, { status: 413 });
      }

      // Bytes live only in this in-memory buffer for the life of the request.
      const text = await extractPdfText(await f.arrayBuffer());
      if (text.length < MIN_TEXT_CHARS && !intent) {
        return NextResponse.json(
          {
            error:
              "Vi hittar ingen text i den här PDF:en. Den kanske är en inskannad bild. Skriv istället vad du söker för jobb.",
          },
          { status: 422 }
        );
      }
      source = intent ? `${text}\n\n## What I'm looking for\n${intent}` : text;
    } else {
      const body = await req.json().catch(() => ({}));
      source = String(body?.cvText ?? "");
      if (!source.trim()) {
        return NextResponse.json({ error: "Skriv eller klistra in något först." }, { status: 400 });
      }
    }

    const profile = await parseCv(source);
    // Nothing is stored here. The text goes back to the visitor's own browser so that, if
    // they sign up, their CV can follow them into the app (see /api/v1/profile/adopt).
    return NextResponse.json({ profile, cvText: source.slice(0, 12000) });
  } catch (err) {
    // Detail stays in the server log; the client only gets a plain message.
    console.error("[preview/parse]", err);
    return NextResponse.json({ error: "Vi kunde inte läsa ditt CV. Försök igen, eller klistra in texten istället." }, { status: 500 });
  }
}
