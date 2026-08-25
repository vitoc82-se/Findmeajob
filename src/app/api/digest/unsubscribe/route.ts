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
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:64px auto;text-align:center;padding:24px;">
        <div style="display:inline-grid;place-items:center;width:40px;height:40px;border-radius:10px;background:#4f46e5;color:#fff;font-weight:700;font-size:20px;">F</div>
        <h2 style="margin-top:16px;">Findmeajob</h2>
        <p style="color:#444;">${msg}</p>
      </div>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );

  if (!verifyUnsub(u, t)) return page("Invalid or expired unsubscribe link.");
  await prisma.profile.updateMany({ where: { userId: u }, data: { digestEnabled: false } });
  return page("You've been unsubscribed from the daily digest. You can turn it back on any time inside the app.");
}
