"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { SWEDISH_REGIONS } from "@/lib/sources/regions";
import { DEFAULT_COUNTRY } from "@/lib/sources/countries";
import { fbTrack } from "@/lib/fbpixel";
import { safeHref } from "@/lib/url";

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
  s >= 75 ? "bg-green-100 text-green-800" : s >= 50 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600";

function SignUp({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <SignUpButton mode="redirect" forceRedirectUrl="/app">
      <button className={className}>{children}</button>
    </SignUpButton>
  );
}

// Full-screen progress overlay (mirrors the authenticated app). Both slow steps
// — the CV parse (~15s LLM call) and the preview search (~30s multi-source +
// embed + rerank) — show a live indicator instead of a dead button: elapsed
// counter, an accent bar easing toward ~95%, and status text stepping through
// what's actually happening. `tau` sets how fast the bar fills (~expected secs).
interface Stage {
  at: number;
  label: string;
}

const PARSE_STAGES: Stage[] = [
  { at: 0, label: "Reading your CV…" },
  { at: 3, label: "Pulling out your experience…" },
  { at: 6, label: "Spotting your skills and strengths…" },
  { at: 9, label: "Working out the roles that fit you…" },
  { at: 12, label: "Building your job-search profile…" },
];

const SEARCH_STAGES: Stage[] = [
  { at: 0, label: "Searching Swedish job sources…" },
  { at: 5, label: "Gathering roles that match you…" },
  { at: 11, label: "Removing duplicate postings…" },
  { at: 17, label: "Ranking your best matches…" },
  { at: 25, label: "Putting your list together…" },
];

function ProgressOverlay({
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
  // pretending to finish before the server does. `tau` ≈ the expected duration.
  const progress = Math.min(95, Math.round(95 * (1 - Math.exp(-t / tau))));
  const stage = [...stages].reverse().find((s) => secs >= s.at) ?? stages[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 px-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-[color:var(--line)] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            {eyebrow}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-neutral-400">{secs}s</span>
        </div>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">{title}</h2>
        <p key={stage.at} className="mt-1 text-sm text-neutral-500">
          {stage.label}
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-neutral-400">{tail}</p>
      </div>
    </div>
  );
}

const ParsingOverlay = () => (
  <ProgressOverlay
    eyebrow="Reading your CV"
    title="Making sense of your CV"
    stages={PARSE_STAGES}
    tau={7}
    tail="Reading your CV and building your job-search profile. This takes about 15 seconds."
  />
);

const SearchingOverlay = () => (
  <ProgressOverlay
    eyebrow="Finding jobs"
    title="Finding your best matches"
    stages={SEARCH_STAGES}
    tau={10}
    tail="Searching multiple sources and ranking every role against your profile. This can take up to ~30 seconds."
  />
);

export default function Try() {
  const [cvText, setCvText] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [customTitles, setCustomTitles] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(new Set());
  const country = DEFAULT_COUNTRY; // Sweden-first — no country selector for now
  const [remote, setRemote] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [showRegions, setShowRegions] = useState(true);

  const [results, setResults] = useState<PreviewMatch[]>([]);
  const [lockedScores, setLockedScores] = useState<number[]>([]);
  const [total, setTotal] = useState(0);
  const [ran, setRan] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "parse" | "run">(null);

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function addCustomTitle() {
    const t = newTitle.trim();
    if (!t) return;
    if (!customTitles.includes(t) && !profile?.titles.includes(t)) setCustomTitles((c) => [...c, t]);
    setSelectedTitles((s) => new Set(s).add(t));
    setNewTitle("");
  }

  const canSubmitCv = (cvFile !== null || cvText.trim().length > 0) && busy === null;

  // Parse the CV (no signup, nothing stored). We DON'T auto-search: the visitor
  // lands on the refine panel first so they can pick where they want to work
  // before we run — a Stockholm-only seeker shouldn't get a nationwide list.
  async function startPreview() {
    setError(null);
    setWarning(null);
    setBusy("parse");
    try {
      let data: { profile?: Profile; error?: string; detail?: string };
      if (cvFile) {
        const form = new FormData();
        form.append("file", cvFile);
        if (cvText.trim()) form.append("intent", cvText.trim());
        const res = await fetch("/api/v1/preview/parse", { method: "POST", body: form });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't read your CV");
      } else {
        const res = await fetch("/api/v1/preview/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvText: cvText.trim() }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't read your input");
      }
      if (!data.profile) throw new Error("Couldn't build a profile from that");
      const p = data.profile;
      setProfile(p);
      setSelectedTitles(new Set<string>(p.titles));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function runPreview(p: Profile, titles: Set<string>) {
    setBusy("run");
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/v1/preview/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: p,
          titles: [...titles],
          regions: [...selectedRegions],
          remote,
          country,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results ?? []);
      setLockedScores(data.lockedScores ?? []);
      setTotal(data.total ?? 0);
      setWarning(data.warning ?? null);
      setRan(true);
      fbTrack("Search");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">{children}</div>
  );

  const regionLabel =
    selectedRegions.size === 0 ? "All of Sweden" : `${selectedRegions.size} region${selectedRegions.size > 1 ? "s" : ""}`;

  // ---- Input screen --------------------------------------------------------
  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        {busy === "parse" && <ParsingOverlay />}
        <div className="text-xs font-medium uppercase tracking-wide text-accent">Try it free · no sign-up</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">See your matches in ~30 seconds</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste your CV or describe what you&apos;re after. We&apos;ll search real Swedish job sources and show your
          top matches — no account needed. Your file is read, parsed, and discarded; nothing is stored.
        </p>

        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            {cvFile ? (
              <div className="flex items-center gap-2 rounded-md border border-accent-soft bg-accent-soft px-3 py-2 text-sm">
                <span className="font-medium text-accent">✓ {cvFile.name}</span>
                <button onClick={() => setCvFile(null)} className="text-xs text-neutral-500 hover:text-neutral-800">
                  remove
                </button>
              </div>
            ) : (
              <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:border-accent">
                Upload CV (PDF)
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
            <span className="text-xs text-neutral-400">Read, parsed, and discarded — never stored.</span>
          </div>

          <label className="mt-4 block text-sm font-medium">
            What are you looking for?{" "}
            <span className="font-normal text-neutral-400">(optional, sharpens your matches)</span>
          </label>
          <textarea
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            placeholder="e.g. Moving out of consulting into a product role. Prefer remote or Stockholm, smaller company."
            rows={4}
            className="mt-1 w-full rounded-md border border-neutral-300 p-3 text-sm focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-400">No CV file? Just describe yourself and what you want.</p>

          <button
            onClick={startPreview}
            disabled={!canSubmitCv}
            className="mt-4 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy === "parse" ? "Reading your CV…" : "Continue →"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <p className="mt-8 text-xs text-neutral-400">
          Already have an account?{" "}
          <Link href="/app" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    );
  }

  // ---- Results screen ------------------------------------------------------
  const lockedNote = "Sign up free to save jobs and generate a tailored CV + cover letter.";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {busy === "run" && <SearchingOverlay />}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Your matches</h1>
        <button
          onClick={() => {
            setProfile(null);
            setResults([]);
            setLockedScores([]);
            setRan(false);
            setCvFile(null);
            setCvText("");
          }}
          className="text-xs text-neutral-500 hover:underline"
        >
          Start over
        </button>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{profile.summary}</p>
      {!ran && (
        <p className="mt-2 rounded-md border border-accent-soft bg-accent-soft/50 px-3 py-2 text-sm text-neutral-600">
          Nearly there — pick where you want to work below, then show your matches.
        </p>
      )}

      {/* Refine panel */}
      <section className="mt-5 rounded-lg border border-[color:var(--line)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <SectionLabel>Roles you&apos;re searching for</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...profile.titles, ...customTitles].map((t) => {
            const on = selectedTitles.has(t);
            return (
              <button
                key={t}
                onClick={() => setSelectedTitles((s) => toggle(s, t))}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  on ? "bg-ink text-white" : "border border-[color:var(--line)] bg-white text-neutral-500 hover:border-neutral-400"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex gap-1.5">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTitle();
              }
            }}
            placeholder="Add a role we missed…"
            className="flex-1 rounded-md border border-[color:var(--line)] px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
          />
          <button
            onClick={addCustomTitle}
            disabled={!newTitle.trim()}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:border-neutral-500 disabled:opacity-40"
          >
            Add
          </button>
        </div>

        <div className="mt-5 border-t border-[color:var(--line)] pt-5">
          <SectionLabel>Where in Sweden</SectionLabel>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
              className="accent-[color:var(--accent)]"
            />
            Remote only
          </label>
          <div className="mt-2">
            <button
              onClick={() => setShowRegions((v) => !v)}
              className="text-sm text-accent hover:underline disabled:text-neutral-300 disabled:no-underline"
              disabled={remote}
            >
              Region: {remote ? "n/a (remote)" : regionLabel} {showRegions ? "▲" : "▼"}
            </button>
            {showRegions && !remote && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {SWEDISH_REGIONS.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      checked={selectedRegions.has(r.id)}
                      onChange={() => setSelectedRegions((s) => toggle(s, r.id))}
                      className="accent-[color:var(--accent)]"
                    />
                    {r.label.replace(" län", "")}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-neutral-400">
              Leave all unchecked to search across Sweden.
            </p>
          </div>
        </div>

        <button
          onClick={() => runPreview(profile, selectedTitles)}
          disabled={busy !== null || selectedTitles.size === 0}
          className="mt-5 w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 sm:w-auto sm:px-6"
        >
          {busy === "run" ? "Finding jobs…" : ran ? "Update matches" : "Show my matches"}
        </button>
      </section>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          {error.includes("preview limit") && (
            <div className="mt-2">
              <SignUp className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Sign up free — no limits
              </SignUp>
            </div>
          )}
        </div>
      )}
      {warning && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{warning}</div>
      )}

      {ran && !error && (
        <section className="mt-6 space-y-3">
          {total === 0 ? (
            <p className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
              No matches for this search yet. Try different roles, or widen the location.
            </p>
          ) : (
            <>
              <h2 className="text-sm font-semibold">
                Your top {results.length} of {total} matches
              </h2>

              {results.map((m) => (
                <div key={m.jobId} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <a href={safeHref(m.job.url)} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                        {m.job.headline}
                      </a>
                      <div className="text-sm text-neutral-500">
                        {[m.job.employer, m.job.location].filter(Boolean).join(" · ")}
                      </div>
                      <span className="mt-1 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                        {m.job.source}
                      </span>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-semibold ${scoreColor(m.score)}`}>
                      {m.score}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-700">{m.rationale}</p>
                  {m.gaps && m.gaps.toLowerCase() !== "none" && (
                    <p className="mt-1 text-xs text-neutral-500">Gap: {m.gaps}</p>
                  )}

                  {/* Gated actions — visible but locked, as a signup incentive. */}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      disabled
                      title={lockedNote}
                      className="cursor-not-allowed rounded border border-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-400"
                    >
                      🔒 ★ Save
                    </button>
                    <button
                      disabled
                      title={lockedNote}
                      className="cursor-not-allowed rounded border border-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-400"
                    >
                      🔒 ✍ AI Helper
                    </button>
                    <SignUp className="ml-auto text-xs font-medium text-accent hover:underline">
                      Sign up free to unlock →
                    </SignUp>
                  </div>
                </div>
              ))}

              {/* Locked tail: real scores, blurred details, one signup unlock. */}
              {lockedScores.length > 0 && (
                <div className="relative">
                  <div className="space-y-3" aria-hidden>
                    {lockedScores.slice(0, 4).map((s, i) => (
                      <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3 blur-sm select-none">
                          <div className="space-y-2">
                            <div className="h-4 w-56 rounded bg-neutral-200" />
                            <div className="h-3 w-40 rounded bg-neutral-100" />
                            <div className="h-3 w-24 rounded bg-neutral-100" />
                          </div>
                          <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-semibold ${scoreColor(s)}`}>
                            {s}
                          </span>
                        </div>
                        <div className="mt-3 h-3 w-full rounded bg-neutral-100 blur-sm" />
                      </div>
                    ))}
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="max-w-sm rounded-xl border border-neutral-200 bg-white/95 p-5 text-center shadow-lg backdrop-blur-sm">
                      <p className="text-sm font-semibold text-ink">
                        {total - results.length} more matches waiting
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Create a free account to see every match, save jobs, get a tailored CV + cover letter for each, and a
                        daily email of new roles.
                      </p>
                      <SignUp className="mt-3 rounded-md bg-ink px-5 py-2 text-sm font-medium text-white hover:opacity-90">
                        Sign up free — see all {total}
                      </SignUp>
                      <p className="mt-2 text-[11px] text-neutral-400">No credit card. Takes a few seconds.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* If everything fit in the free preview, still invite signup for the tools. */}
              {lockedScores.length === 0 && (
                <div className="rounded-xl border border-accent-soft bg-accent-soft/40 p-5 text-center">
                  <p className="text-sm font-semibold text-ink">Like what you see?</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-500">
                    Create a free account to save these jobs, generate a tailored CV + cover letter for each, and get a daily
                    email of new matches.
                  </p>
                  <SignUp className="mt-3 rounded-md bg-ink px-5 py-2 text-sm font-medium text-white hover:opacity-90">
                    Sign up free
                  </SignUp>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
