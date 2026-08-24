// F1 cross-source dedup (layers 1-2). Two postings are the same job if they
// share a canonical URL OR a dedupHash (normalized employer+title+location).
// We union by both signals so the same role on JobTech, Adzuna, and Remotive
// collapses to one card. (Layer 3, embedding near-dup, is a later phase.)

export interface DedupableJob {
  id: string;
  source: string;
  canonicalUrl: string | null;
  dedupHash: string;
}

// Prefer the richest/most-authoritative source as the representative shown.
const SOURCE_PRIORITY: Record<string, number> = {
  jobtech: 0, // richest text (full description) — prefer as the shown card
  joblinks: 1,
  adzuna: 2,
  remotive: 3,
};

function normalizeUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return (url.origin + url.pathname).toLowerCase().replace(/\/+$/, "");
  } catch {
    return u.toLowerCase();
  }
}

interface Group<T> {
  items: T[];
  urls: Set<string>;
  hashes: Set<string>;
}

// Reduce a mixed-source job list to one representative per unique job.
export function dedupeToRepresentatives<T extends DedupableJob>(jobs: T[]): T[] {
  const groups: Group<T>[] = [];

  for (const job of jobs) {
    const nurl = normalizeUrl(job.canonicalUrl);
    const hash = job.dedupHash;
    const match = groups.find(
      (g) => (nurl !== null && g.urls.has(nurl)) || g.hashes.has(hash)
    );
    if (match) {
      match.items.push(job);
      if (nurl) match.urls.add(nurl);
      match.hashes.add(hash);
    } else {
      groups.push({
        items: [job],
        urls: new Set(nurl ? [nurl] : []),
        hashes: new Set([hash]),
      });
    }
  }

  return groups.map((g) =>
    g.items.reduce((best, cur) =>
      (SOURCE_PRIORITY[cur.source] ?? 9) < (SOURCE_PRIORITY[best.source] ?? 9)
        ? cur
        : best
    )
  );
}
