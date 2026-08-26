import { NextRequest, NextResponse } from "next/server";
import { parseCv } from "@/lib/matching/parseCv";
import { extractPdfText } from "@/lib/pdf";
import { rateLimit, ANON_LIMITS, clientIp } from "@/lib/rateLimit";

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
  const ipKey = `ip:${clientIp(req)}`;
  const rl = await rateLimit(ipKey, "preview_parse", ANON_LIMITS.parse.max, ANON_LIMITS.parse.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `You've hit the free preview limit. Sign up free to keep going, or try again in ~${rl.retryAfterMinutes} min.` },
      { status: 429 }
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
        return NextResponse.json({ error: "No file uploaded (field 'file')" }, { status: 400 });
      }
      if (f.type && f.type !== "application/pdf") {
        return NextResponse.json({ error: "Only PDF files are supported" }, { status: 415 });
      }
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ error: "PDF too large (max 6 MB)" }, { status: 413 });
      }

      // Bytes live only in this in-memory buffer for the life of the request.
      const text = await extractPdfText(await f.arrayBuffer());
      if (text.length < MIN_TEXT_CHARS && !intent) {
        return NextResponse.json(
          {
            error:
              "Couldn't read text from this PDF — it may be a scanned image. Describe what you're looking for instead.",
          },
          { status: 422 }
        );
      }
      source = intent ? `${text}\n\n## What I'm looking for\n${intent}` : text;
    } else {
      const body = await req.json().catch(() => ({}));
      source = String(body?.cvText ?? "");
      if (!source.trim()) {
        return NextResponse.json({ error: "cvText is required" }, { status: 400 });
      }
    }

    const profile = await parseCv(source);
    // `source` (and any PDF bytes) go out of scope here — nothing persists.
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "CV parse failed", detail: message }, { status: 500 });
  }
}
