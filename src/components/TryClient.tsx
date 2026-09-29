"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REGION_OPTIONS, isValidRegionId } from "@/lib/sources/regions";
import { DEFAULT_COUNTRY } from "@/lib/sources/countries";
import { fbTrack } from "@/lib/fbpixel";
import { trackFunnel } from "@/lib/funnel";
import { fmt, type Dict } from "@/lib/i18n";
import { useLang, useT } from "@/components/LangProvider";
import { safeHref } from "@/lib/url";
import { shortLocation } from "@/lib/shortLocation";
import LevelPicker, { levelTag } from "@/components/LevelPicker";
import { normalizeLevel, type Level } from "@/lib/matching/levels";

interface Profile {
  titles: string[];
  seniority: string;
  skills: string[];
  locations: string[];
  languages: string[];
  remotePref: string;
  mustHaves: string[];
  summary: string;
}

interface PreviewMatch {
  jobId: string;
  score: number;
  rationale: string;
  gaps: string;
  level?: string;
  job: {
    headline: string;
    employer: string | null;
    location: string | null;
    url: string;
    source: string;
    applicationDeadline: string | null;
  };
}

const scoreColor = (s: number) =>
  s >= 75 ? "bg-sun text-ink" : s >= 50 ? "bg-sun-soft text-ink" : "border border-neutral-300 bg-white text-neutral-600";

// "none" / "inga" / "ingen" — the model's way of saying there's nothing missing.
const NO_GAPS = /^(none|inga|ingen)\b/i;

const MAX_TYPED_TITLES = 5;

// Sign-up prompts are plain links to /sign-up, which hands off to Clerk. The auth
// SDK itself is not loaded on this page.
function SignUp({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <a href="/sign-up" onClick={() => trackFunnel("signup_click")} className={className}>
      {children}
    </a>
  );
}

// Inline progress card. Both slow steps — the CV parse (~15s LLM call) and the
// search (~30s multi-source + embed + rerank) — show a live indicator instead of a
// dead button: elapsed counter, an accent bar easing toward ~95%, and status text
// stepping through what's actually happening. `tau` ≈ expected duration in secs.
interface Stage {
  at: number;
  label: string;
}

function ProgressCard({
  eyebrow,
  title,
  stages,
  tail,
  tau,
}: {
  eyebrow: string;
  title: string;
  stages: Stage[];
  tail: string;
  tau: number;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 150);
    return () => clearInterval(id);
  }, []);

  const secs = Math.floor(elapsedMs / 1000);
  const t = elapsedMs / 1000;
  // Fast early, asymptotically approaching 95% — reads as progress without
  // pretending to finish before the server does.
  const progress = Math.min(95, Math.round(95 * (1 - Math.exp(-t / tau))));
  const stage = [...stages].reverse().find((s) => secs >= s.at) ?? stages[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-[color:var(--line)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-500">{eyebrow}</span>
        <span className="text-xs tabular-nums text-neutral-500">{secs}s</span>
      </div>
      <h2 className="mt-3 text-lg font-semibold tracking-tight">{title}</h2>
      <p key={stage.at} className="mt-1 text-sm text-neutral-500">
        {stage.label}
      </p>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-sm bg-neutral-100">
        <div
          className="h-full rounded-sm bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-neutral-500">{tail}</p>
    </div>
  );
}

const searchStages = (t: Dict): Stage[] => [
  { at: 0, label: t.p0 },
  { at: 2, label: t.p1 },
  { at: 4, label: t.p2 },
  { at: 6, label: t.p3 },
  { at: 9, label: t.p4 },
];
const parseStages = (t: Dict): Stage[] => [
  { at: 0, label: t.c0 },
  { at: 1, label: t.c1 },
  { at: 2, label: t.c2 },
  { at: 3, label: t.c3 },
  { at: 4, label: t.c4 },
];

const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="text-sm font-semibold text-neutral-500">
    {children}
  </label>
);

// "projektledare, produktägare" → ["projektledare", "produktägare"]
function splitTitles(q: string): string[] {
  return q
    .split(/[,;\n]/)
    .map((s) => s.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, MAX_TYPED_TITLES);
}

export default function TryClient() {
  const t = useT();
  const lang = useLang();
  const country = DEFAULT_COUNTRY; // Sweden-first — no country selector for now

  // The search itself: what the visitor typed + where.
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState(""); // "" = all of Sweden, "remote", or a region id
  const [level, setLevel] = useState<Level | "">(""); // "" = any level

  // Optional CV upgrade: parsed profile + which of its roles are switched on.
  const [cvOpen, setCvOpen] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState("");
  const [cvProfile, setCvProfile] = useState<Profile | null>(null);
  const [cvTitles, setCvTitles] = useState<Set<string>>(new Set());

  const [results, setResults] = useState<PreviewMatch[]>([]);
  const [lockedScores, setLockedScores] = useState<number[]>([]);
  const [total, setTotal] = useState(0);
  const [ran, setRan] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<{ msg: string; limit: boolean } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "parse" | "run">(null);

  const queryRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Build the profile the API wants from what we know: typed titles first, then
  // any CV roles that are switched on. With no CV this is just the titles — the
  // matcher works from those alone, which is what makes one-field search possible.
  function buildProfile(q: string, cv: Profile | null, cvOn: Set<string>, lvl: Level | ""): Profile | null {
    const typed = splitTitles(q);
    const fromCv = cv ? cv.titles.filter((x) => cvOn.has(x)) : [];
    const titles = [...typed, ...fromCv.filter((x) => !typed.includes(x))].slice(0, 8);
    if (titles.length === 0) return null;
    const base: Profile = cv ?? {
      titles: [],
      seniority: "",
      skills: [],
      locations: [],
      languages: [],
      remotePref: "any",
      mustHaves: [],
      summary: "",
    };
    return { ...base, titles, seniority: lvl, summary: cv ? base.summary : q.trim() };
  }

  async function search(o?: { q?: string; region?: string; level?: Level | ""; cv?: Profile | null; cvOn?: Set<string> }) {
    const q = o?.q ?? query;
    const r = o?.region ?? region;
    const lvl = o?.level ?? level;
    const profile = buildProfile(q, o?.cv === undefined ? cvProfile : o.cv, o?.cvOn ?? cvTitles, lvl);
    if (!profile) {
      setHint(t.needQuery);
      queryRef.current?.focus();
      return;
    }
    setHint(null);
    setBusy("run");
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/v1/preview/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          titles: profile.titles,
          regions: r && r !== "remote" ? [r] : [],
          remote: r === "remote",
          country,
          lang,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setError({ msg: t.errLimit, limit: true });
        return;
      }
      if (!res.ok) throw new Error(t.errGeneric);
      setResults(data.results ?? []);
      setLockedScores(data.lockedScores ?? []);
      setTotal(data.total ?? 0);
      setWarning(data.warning ? t.warnSources : null);
      setRan(true);
      fbTrack("Search");
      if ((data.total ?? 0) > 0) trackFunnel("results");
      // Bring results into view on small screens, where the bar sits above the fold.
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch {
      setError({ msg: t.errGeneric, limit: false });
    } finally {
      setBusy(null);
    }
  }

  // Parse the optional CV (nothing stored), then immediately re-run the search
  // with the richer profile so the visitor sees the improvement, not a form.
  async function addCv() {
    setError(null);
    setBusy("parse");
    let parsed: Profile | null = null;
    try {
      let res: Response;
      if (cvFile) {
        const form = new FormData();
        form.append("file", cvFile);
        if (cvText.trim()) form.append("intent", cvText.trim());
        res = await fetch("/api/v1/preview/parse", { method: "POST", body: form });
      } else {
        res = await fetch("/api/v1/preview/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvText: cvText.trim() }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setError({ msg: t.errLimit, limit: true });
        return;
      }
      if (!res.ok || !data.profile) throw new Error(t.errCv);
      parsed = data.profile as Profile;
    } catch {
      setError({ msg: t.errCv, limit: false });
      return;
    } finally {
      setBusy(null);
    }
    const on = new Set<string>(parsed.titles);
    setCvProfile(parsed);
    setCvTitles(on);
    setCvOpen(false);
    trackFunnel("cv_added");
    // Preselect the level the CV suggests (unless the visitor already chose one).
    const lvl = level || normalizeLevel(parsed.seniority);
    setLevel(lvl);
    await search({ cv: parsed, cvOn: on, level: lvl });
  }

  function toggleCvTitle(title: string) {
    setCvTitles((s) => {
      const next = new Set(s);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  // Deep link from the landing page: /try?q=…&r=… runs the search on arrival so
  // the visitor's first screen after the click is results, not another form.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    trackFunnel("try_open");
    const p = new URLSearchParams(window.location.search);
    const q = (p.get("q") ?? "").trim().slice(0, 200);
    const rParam = p.get("r") ?? "";
    const r = rParam === "remote" || isValidRegionId(rParam) ? rParam : "";
    const lvl = normalizeLevel(p.get("s"));
    setRegion(r);
    setLevel(lvl);
    if (!q) return;
    setQuery(q);
    void search({ q, region: r, level: lvl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a region is picked, say how the list is ordered so a far-away job further
  // down doesn't look like a mistake.
  const regionLabel = REGION_OPTIONS.find((r) => r.id === region)?.label;
  const regionNote = regionLabel ? fmt(t.regionNote, { r: regionLabel }) : null;

  const regionOptions = (
    <>
      <option value="">{t.allSweden}</option>
      <option value="remote">{t.remoteOnly}</option>
      {REGION_OPTIONS.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label}
        </option>
      ))}
    </>
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">
      <h1 className="mb-4 font-display text-3xl font-extrabold sm:text-4xl">{t.tryH1}</h1>
      {/* Search bar — always on screen, the same before and after the first search. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="rounded-lg border border-[color:var(--line)] bg-white p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_15rem]">
          <div>
            <Label htmlFor="q">{t.qLabel}</Label>
            <input
              id="q"
              ref={queryRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.qPlaceholder}
              autoComplete="off"
              className="mt-2 w-full rounded border border-[color:var(--line)] px-3 py-2.5 text-base focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <Label htmlFor="r">{t.regionLabel}</Label>
            <select
              id="r"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-2 w-full rounded border border-[color:var(--line)] bg-white px-3 py-2.5 text-base focus:border-accent focus:outline-none"
            >
              {regionOptions}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <LevelPicker
            value={level}
            onChange={(l) => {
              setLevel(l);
              // Once results are on screen, a tap re-sorts them for the new level.
              if (ran && query.trim()) void search({ level: l });
            }}
          />
        </div>

        {hint && <p className="mt-3 text-sm text-neutral-600">{hint}</p>}

        {/* Optional CV upgrade, collapsed by default. */}
        <div className="mt-4 border-t border-[color:var(--line)] pt-4">
          <button
            type="button"
            onClick={() => setCvOpen((v) => !v)}
            aria-expanded={cvOpen}
            className="flex w-full items-center justify-between text-left text-sm font-medium text-neutral-700 hover:text-ink"
          >
            <span>
              {cvProfile ? `✓ ${t.cvToggleDone}` : t.cvToggle}{" "}
              {!cvProfile && <span className="font-normal text-neutral-500">({t.cvOptional})</span>}
            </span>
            <span aria-hidden className="text-neutral-500">
              {cvOpen ? "▲" : "▼"}
            </span>
          </button>

          {cvProfile && !cvOpen && (
            <div className="mt-3">
              <div className="text-sm font-semibold text-neutral-500">
                {t.cvRolesLabel}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cvProfile.titles.map((title) => {
                  const on = cvTitles.has(title);
                  return (
                    <button
                      type="button"
                      key={title}
                      onClick={() => toggleCvTitle(title)}
                      aria-pressed={on}
                      className={`rounded px-2.5 py-1 text-sm font-medium ${
                        on
                          ? "bg-brand text-white"
                          : "border border-[color:var(--line)] bg-white text-neutral-500 hover:border-neutral-400"
                      }`}
                    >
                      {title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {cvOpen && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-3">
                {cvFile ? (
                  <div className="flex items-center gap-2 rounded border border-accent-soft bg-accent-soft px-3 py-2 text-sm">
                    <span className="font-medium text-accent">✓ {cvFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setCvFile(null)}
                      className="text-sm text-neutral-500 hover:text-neutral-800"
                    >
                      {t.cvRemove}
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:border-accent">
                    {t.cvUpload}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setCvFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <span className="text-sm text-neutral-500">{t.cvPrivacy}</span>
              </div>
              <textarea
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                placeholder={`${t.cvPaste}\n${t.cvPastePlaceholder}`}
                rows={4}
                className="mt-3 w-full rounded border border-[color:var(--line)] p-3 text-sm focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={addCv}
                disabled={busy !== null || (!cvFile && !cvText.trim())}
                className="mt-3 rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:border-neutral-500 disabled:opacity-40"
              >
                {t.cvApply}
              </button>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={busy !== null}
          className="mt-4 w-full rounded-full bg-brand px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          {ran ? t.searchAgain : `${t.searchBtn} →`}
        </button>
      </form>

      <div ref={resultsRef} className="scroll-mt-4">
        {busy === "parse" && (
          <div className="mt-6">
            <ProgressCard
              eyebrow={t.parseEyebrow}
              title={t.parseTitle}
              stages={parseStages(t)}
              tail={t.parseTail}
              tau={2.5}
            />
          </div>
        )}
        {busy === "run" && (
          <div className="mt-6">
            <ProgressCard
              eyebrow={t.searchEyebrow}
              title={t.searchTitle}
              stages={searchStages(t)}
              tail={t.searchTail}
              tau={4.5}
            />
          </div>
        )}

        {error && (
          <div className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error.msg}
            {error.limit && (
              <div className="mt-2">
                <SignUp className="inline-block rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
                  {t.limitCta}
                </SignUp>
              </div>
            )}
          </div>
        )}
        {warning && (
          <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{warning}</div>
        )}

        {ran && !error && busy !== "run" && (
          <section className="mt-8 space-y-3">
            {total === 0 ? (
              <p className="rounded-lg border border-[color:var(--line)] bg-white p-4 text-sm text-neutral-500">
                {t.noResults}
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-neutral-500">
                    {t.resultsLabel}
                  </h2>
                  <span className="text-xs tabular-nums text-neutral-500">
                    {fmt(t.matchesCount, { n: total })}
                  </span>
                </div>

                {regionNote && <p className="-mt-1 text-sm text-neutral-600">{regionNote}</p>}

                {results.map((m) => (
                  <div
                    key={m.jobId}
                    className="rounded-lg border border-[color:var(--line)] bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <a
                          href={safeHref(m.job.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-bold leading-snug hover:underline"
                        >
                          {m.job.headline}
                        </a>
                        <div className="text-sm text-neutral-500">
                          {[m.job.employer, shortLocation(m.job.location)].filter(Boolean).join(" · ")}
                        </div>
                        {levelTag(t, m.level) && (
                          <span className="mt-1.5 inline-block rounded-full bg-mint px-2.5 py-0.5 text-xs font-semibold text-brand">
                            {levelTag(t, m.level)}
                          </span>
                        )}
                      </div>
                      <span
                        className={`stamp grid h-12 w-12 shrink-0 place-items-center rounded-[14px] font-display text-xl font-extrabold tabular-nums ${scoreColor(m.score)}`}
                      >
                        {m.score}
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] text-neutral-700">{m.rationale}</p>
                    {m.gaps && !NO_GAPS.test(m.gaps.trim()) && (
                      <p className="mt-1 text-sm text-neutral-500">{m.gaps}</p>
                    )}
                    <div className="mt-3 border-t border-[color:var(--line)] pt-3">
                      <SignUp className="text-sm font-semibold text-brand hover:underline">
                        {t.saveCta} →
                      </SignUp>
                    </div>
                  </div>
                ))}

                {/* Locked tail: real scores, blurred details, one signup unlock. */}
                {lockedScores.length > 0 && (
                  <div className="relative">
                    <div className="space-y-3" aria-hidden>
                      {lockedScores.slice(0, 3).map((s, i) => (
                        <div key={i} className="rounded-lg border border-[color:var(--line)] bg-white p-4">
                          <div className="flex select-none items-start justify-between gap-3 blur-sm">
                            <div className="space-y-2">
                              <div className="h-4 w-56 rounded bg-neutral-200" />
                              <div className="h-3 w-40 rounded bg-neutral-100" />
                            </div>
                            <span className={`stamp grid h-12 w-12 shrink-0 place-items-center rounded-[14px] font-display text-xl font-extrabold ${scoreColor(s)}`}>
                              {s}
                            </span>
                          </div>
                          <div className="mt-3 h-3 w-full rounded bg-neutral-100 blur-sm" />
                        </div>
                      ))}
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center px-2">
                      <div className="max-w-sm rounded-lg border border-[color:var(--line)] bg-white/95 p-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-sm">
                        <p className="text-sm font-semibold text-ink">
                          {fmt(t.moreWaiting, { n: total - results.length })}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">{t.moreBody}</p>
                        <SignUp className="mt-3 inline-block rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:opacity-90">
                          {fmt(t.signupSeeAll, { n: total })}
                        </SignUp>
                        <p className="mt-2 text-xs text-neutral-500">{t.signupNote}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* If everything fit in the free preview, still invite signup for the tools. */}
                {lockedScores.length === 0 && (
                  <div className="rounded-lg border border-accent-soft bg-accent-soft/40 p-5 text-center">
                    <p className="text-sm font-semibold text-ink">{t.likeIt}</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">{t.likeBody}</p>
                    <SignUp className="mt-3 inline-block rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:opacity-90">
                      {t.signupFree}
                    </SignUp>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      <p className="mt-10 text-sm text-neutral-500">
        {t.haveAccount}{" "}
        <Link href="/sign-in" className="text-accent hover:underline">
          {t.signIn}
        </Link>
      </p>
    </main>
  );
}
