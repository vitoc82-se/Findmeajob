import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import type { RawJob } from "./sources/types";

// RawJob -> the shape we persist as a Job row. This is the SINGLE place
// normalization happens, so every source ends up with a consistent schema.

function normalizeText(s: string | undefined | null): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ") // strip punctuation, keep letters/numbers
    .trim()
    .replace(/\s+/g, " ");
}

// F1 layer 2: exact-ish dedup key. Two postings with the same normalized
// employer + title + location collide. (Layers 1 (canonical URL) and 3
// (embedding near-dup) arrive in Phase 2.)
export function dedupHash(job: {
  employer?: string;
  headline: string;
  location?: string;
}): string {
  const key = [
    normalizeText(job.employer),
    normalizeText(job.headline),
    normalizeText(job.location),
  ].join("|");
  return createHash("sha1").update(key).digest("hex");
}

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export interface NormalizedJob {
  source: string;
  sourceId: string;
  canonicalUrl: string | null;
  dedupHash: string;
  headline: string;
  employer: string | null;
  location: string | null;
  description: string;
  url: string;
  publishedAt: Date | null;
  applicationDeadline: Date | null;
  raw: Prisma.InputJsonValue;
}

export function normalize(source: string, raw: RawJob): NormalizedJob {
  return {
    source,
    sourceId: raw.sourceId,
    canonicalUrl: raw.canonicalUrl ?? null,
    dedupHash: dedupHash({
      employer: raw.employer,
      headline: raw.headline,
      location: raw.location,
    }),
    headline: raw.headline,
    employer: raw.employer ?? null,
    location: raw.location ?? null,
    description: raw.description,
    url: raw.url,
    publishedAt: toDate(raw.publishedAt),
    applicationDeadline: toDate(raw.applicationDeadline),
    raw: (raw.raw ?? {}) as Prisma.InputJsonValue,
  };
}
