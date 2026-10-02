// F1 cross-source dedup (layers 1-2). Two postings are the same job if they
// share a canonical URL OR a dedupHash (normalized employer+title+location).
// We union by both signals so the same role on JobTech, Adzuna, and Remotive
// collapses to one card. (Layer 3, embedding near-dup, is a later phase.)

export interface DedupableJob {
  id: string;
  source: string;
  canonicalUrl: string | null;
  dedupHash: string;
  headline?: string;
  employer?: string | null;
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

// employer | title with no location. The same ad on two sources often names the place
// differently ("Stockholm" vs "Finland", or one lists extra workplaces), so across
// sources identical employer + title counts as the same job even if the location differs.
function looseKey(j: DedupableJob): string | null {
  if (!j.headline || !j.employer) return null;
  const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `${norm(j.employer)}|${norm(j.headline)}`;
}

interface Group<T> {
  items: T[];
  loose: Set<string>;
  sources: Set<string>;
  urls: Set<string>;
  hashes: Set<string>;
}

// Reduce a mixed-source job list to one representative per unique job.
export function dedupeToRepresentatives<T extends DedupableJob>(jobs: T[]): T[] {
  const groups: Group<T>[] = [];

  for (const job of jobs) {
    const nurl = normalizeUrl(job.canonicalUrl);
    const hash = job.dedupHash;
    const loose = looseKey(job);
    const match = groups.find(
      (g) =>
        (nurl !== null && g.urls.has(nurl)) ||
        g.hashes.has(hash) ||
        (loose !== null && g.loose.has(loose) && !g.sources.has(job.source))
    );
    if (match) {
      match.items.push(job);
      if (nurl) match.urls.add(nurl);
      match.hashes.add(hash);
      match.sources.add(job.source);
      if (loose) match.loose.add(loose);
    } else {
      groups.push({
        items: [job],
        urls: new Set(nurl ? [nurl] : []),
        hashes: new Set([hash]),
        sources: new Set([job.source]),
        loose: new Set(loose ? [loose] : []),
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
