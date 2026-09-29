import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsub } from "@/lib/digest";

export const runtime = "nodejs";

// GET /api/digest/unsubscribe?u=<userId>&t=<token>
// Public (no login — clicked from an email), but verified by an HMAC token.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";

  const page = (msg: string) =>
    new NextResponse(
      `<!doctype html><html lang="sv"><title>Findmeajob</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:64px auto;text-align:center;padding:24px;">
        <div style="display:inline-grid;place-items:center;width:40px;height:40px;border-radius:10px;background:#1E6B52;color:#FFD25A;font-weight:800;font-size:20px;">F</div>
        <h2 style="margin-top:16px;color:#1E6B52;">Findmeajob</h2>
        <p style="color:#444;">${msg}</p>
      </div>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );

  if (!verifyUnsub(u, t)) return page("Länken fungerar inte längre. Du kan stänga av mejlen inne i appen istället.");
  await prisma.profile.updateMany({ where: { userId: u }, data: { digestEnabled: false } });
  return page("Klart. Du får inga fler mejl med nya jobb. Vill du ha dem igen kan du slå på dem i appen.");
}
