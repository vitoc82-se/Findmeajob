import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { parseCv } from "./parseCv";
import type { Profile } from "./types";

// Parse CV text into a Profile and store it. Shared by both the paste-text and
// the PDF-upload routes so the parse+persist logic lives in one place.
// NOTE: we persist the extracted TEXT (rawCv) and the structured Profile — never
// an uploaded file. The PDF path extracts text in memory and discards the bytes.
export async function parseAndStoreProfile(
  userId: string,
  cvText: string
): Promise<Profile> {
  const profile = await parseCv(cvText);
  const extracted = profile as unknown as Prisma.InputJsonValue;

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, rawCv: cvText, extracted },
    update: { rawCv: cvText, extracted },
  });

  return profile;
}
