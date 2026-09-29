import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { SearchFilters, PreviewMatch, SourceHealth } from "./runSearch";

// How long a cached search is served. Job ads change daily, so this is short
// enough to stay fresh and long enough for the nightly prewarm to cover a day.
const TTL_MS = 12 * 60 * 60 * 1000;

export interface CachedPreview {
  health: SourceHealth[];
  warning: string | null;
  results: PreviewMatch[];
}

export { isTitleOnly } from "./titles";

export function cacheKey(titles: string[], filters: SearchFilters, level: string = ""): string {
  const norm = {
    t: titles.map((t) => t.trim().toLowerCase()).sort(),
    r: [...filters.regions].sort(),
    m: filters.remote,
    c: filters.country,
    l: filters.lang ?? "en",
    s: level,
    v: 12, // bump when scoring/location logic changes so old answers are not served
  };
  return createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

export async function getCachedPreview(key: string): Promise<CachedPreview | null> {
  try {
    const row = await prisma.searchCache.findUnique({ where: { key } });
    if (!row || Date.now() - row.createdAt.getTime() > TTL_MS) return null;
    return row.payload as unknown as CachedPreview;
  } catch (err) {
    console.error("[search-cache] read failed:", err);
    return null;
  }
}

export async function putCachedPreview(key: string, value: CachedPreview): Promise<void> {
  // Never cache a degraded answer (a source or the re-ranker failed).
  if (value.warning || value.results.length === 0 || value.health.some((h) => h.status === "error")) return;
  try {
    const payload = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    await prisma.searchCache.upsert({
      where: { key },
      create: { key, payload },
      update: { payload, createdAt: new Date() },
    });
  } catch (err) {
    console.error("[search-cache] write failed:", err);
  }
}
