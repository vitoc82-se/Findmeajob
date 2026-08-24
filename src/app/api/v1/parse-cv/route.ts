import { NextRequest, NextResponse } from "next/server";
import { parseAndStoreProfile } from "@/lib/matching/persistProfile";

// Anthropic SDK needs the Node.js runtime (not edge).
export const runtime = "nodejs";

const USER_ID = "niklas"; // single-user v1

// POST /api/v1/parse-cv  { cvText }
// Parses pasted CV text into a structured Profile and stores it.
export async function POST(req: NextRequest) {
  let cvText: string;
  try {
    const body = await req.json();
    cvText = String(body?.cvText ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!cvText.trim()) {
    return NextResponse.json({ error: "cvText is required" }, { status: 400 });
  }

  try {
    const profile = await parseAndStoreProfile(USER_ID, cvText);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "CV parse failed", detail: message },
      { status: 500 }
    );
  }
}
