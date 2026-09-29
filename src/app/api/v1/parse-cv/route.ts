import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { parseAndStoreProfile } from "@/lib/matching/persistProfile";
import { rateLimit, LIMITS } from "@/lib/rateLimit";

// Anthropic SDK needs the Node.js runtime (not edge).
export const runtime = "nodejs";

// POST /api/v1/parse-cv  { cvText }
// Parses pasted CV text into a structured Profile and stores it.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Du behöver logga in först." }, { status: 401 });

  const rl = await rateLimit(userId, "parse", LIMITS.parse.max, LIMITS.parse.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Du har gjort för många försök på kort tid. Vänta ungefär ${rl.retryAfterMinutes} minuter och försök igen.` },
      { status: 429 }
    );
  }

  let cvText: string;
  try {
    const body = await req.json();
    cvText = String(body?.cvText ?? "");
  } catch {
    return NextResponse.json({ error: "Något gick fel i förfrågan. Försök igen." }, { status: 400 });
  }

  if (!cvText.trim()) {
    return NextResponse.json({ error: "Skriv eller klistra in något först." }, { status: 400 });
  }

  try {
    const profile = await parseAndStoreProfile(userId, cvText);
    return NextResponse.json({ profile });
  } catch (err) {
    // Detail stays in the server log; the client only gets a plain message.
    console.error("[parse-cv]", err);
    return NextResponse.json(
      { error: "Vi kunde inte läsa ditt CV. Försök igen, eller klistra in texten istället." },
      { status: 500 }
    );
  }
}
