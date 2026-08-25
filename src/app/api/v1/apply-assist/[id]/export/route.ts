import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { textToDocx } from "@/lib/docx";

export const runtime = "nodejs"; // docx needs Node.js

// GET /api/v1/apply-assist/[id]/export?type=cv|letter → .docx download
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type") === "letter" ? "letter" : "cv";

  const doc = await prisma.applyDoc.findFirst({ where: { id, userId } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isCv = type === "cv";
  const title = isCv ? "CV" : doc.language === "sv" ? "Personligt brev" : "Cover letter";
  const text = isCv ? doc.tailoredCv : doc.coverLetter;
  const filename = `${isCv ? "cv" : "cover-letter"}.docx`;

  const buffer = await textToDocx(title, text);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
