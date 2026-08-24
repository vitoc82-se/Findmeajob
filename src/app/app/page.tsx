"use client";

import { useEffect, useState } from "react";
import { SWEDISH_REGIONS } from "@/lib/sources/regions";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/sources/countries";

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

interface MatchJob {
  headline: string;
  employer: string | null;
  location: string | null;
  url: string;
  source: string;
  applicationDeadline: string | null;
}

interface Match {
  id: string;
  score: number;
  rationale: string;
  gaps: string;
  status: string;
  job: MatchJob;
}

interface Health {
  source: string;
  fetchedCount: number;
  status: string;
  error?: string;
}

type Step = "welcome" | "cv" | "confirm" | null; // null = the app (search) view

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>(null);

  const [cvText, setCvText] = useState(""); // the "what are you looking for" / intent box
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [customTitles, setCustomTitles] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(new Set());
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [remote, setRemote] = useState(false);
  const [showRegions, setShowRegions] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const [busy, setBusy] = useState<null | "parse" | "upload" | "run">(null);
  const [error, setError] = useState<string | null>(null);

  // On load, decide onboarding (no profile) vs the app (profile exists).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/profile");
        const data = res.ok ? await res.json() : { profile: null };
        if (data.profile) {
          applyProfile(data.profile);
          setStep(null);
        } else {
          // Landing page is the welcome; first-timers start at the CV step.
          setStep("cv");
        }
      } catch {
        setStep("cv");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyProfile(p: Profile) {
    setProfile(p);
    setCustomTitles([]);
    setSelectedTitles(new Set<string>(p.titles));
    setCvFile(null);
    setCvText("");
  }

  function addCustomTitle() {
    const t = newTitle.trim();
    if (!t) return;
    if (!customTitles.includes(t) && !profile?.titles.includes(t)) {
      setCustomTitles((c) => [...c, t]);
    }
    setSelectedTitles((s) => new Set(s).add(t));
    setNewTitle("");
  }

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  // Build the profile from whatever the user gave: a CV file, an intent note,
  // or both. The PDF path combines the extracted CV text with the intent
  // server-side; the text-only path parses the intent as the profile source.
  async function submitCv() {
    const intent = cvText.trim();
    setError(null);
    try {
      let data: { profile?: Profile; error?: string; detail?: string };
      if (cvFile) {
        setBusy("upload");
        const form = new FormData();
        form.append("file", cvFile);
        if (intent) form.append("intent", intent);
        const res = await fetch("/api/v1/parse-cv-pdf", { method: "POST", body: form });
        data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.error || "PDF parse failed");
      } else {
        setBusy("parse");
        const res = await fetch("/api/v1/parse-cv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvText: intent }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.error || "Parse failed");
      }
      if (data.profile) applyProfile(data.profile);
      if (step) setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function findJobs() {
    setBusy("run");
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/v1/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titles: [...selectedTitles],
          regions: [...selectedRegions],
          remote,
          country,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Run failed");
      setMatches(data.matches ?? []);
      setHealth(data.health ?? []);
      setWarning(data.warning ?? null);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function updateMatchStatus(id: string, status: string) {
    setMatches((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));
    try {
      await fetch("/api/v1/match/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      /* next run reloads authoritative state */
    }
  }

  const scoreColor = (s: number) =>
    s >= 75 ? "bg-green-100 text-green-800" : s >= 50 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600";

  const regionLabel =
    selectedRegions.size === 0 ? "All of Sweden" : `${selectedRegions.size} region${selectedRegions.size > 1 ? "s" : ""}`;

  // ---- Shared sub-renders --------------------------------------------------

  const canSubmitCv = (cvFile !== null || cvText.trim().length > 0) && busy === null;

  const cvInput = (
    <div>
      {/* CV upload — the rich source */}
      <div className="flex flex-wrap items-center gap-3">
        {cvFile ? (
          <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
            <span className="font-medium text-indigo-700">✓ {cvFile.name}</span>
            <button
              onClick={() => setCvFile(null)}
              className="text-xs text-neutral-500 hover:text-neutral-800"
              disabled={busy !== null}
            >
              remove
            </button>
          </div>
        ) : (
          <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:border-indigo-400">
            Upload CV (PDF)
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setCvFile(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <span className="text-xs text-neutral-400">
          Read, parsed, and discarded — your file is never stored.
        </span>
      </div>

      {/* Intent — what they actually want */}
      <label className="mt-4 block text-sm font-medium">
        What are you looking for?{" "}
        <span className="font-normal text-neutral-400">(optional, but it sharpens your matches)</span>
      </label>
      <textarea
        value={cvText}
        onChange={(e) => setCvText(e.target.value)}
        placeholder="e.g. Moving out of consulting into a product role. Prefer remote or Stockholm, smaller company. Open to a step up to team lead."
        rows={4}
        className="mt-1 w-full rounded-md border border-neutral-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <p className="mt-1 text-xs text-neutral-400">
        No CV file? Just describe yourself and what you want here — that works too.
      </p>

      <button
        onClick={submitCv}
        disabled={!canSubmitCv}
        className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
      >
        {busy === "upload" ? "Reading CV…" : busy === "parse" ? "Reading…" : "Continue"}
      </button>
    </div>
  );

  const filterControls = profile && (
    <>
      {/* Deselectable + custom title chips */}
      <div>
        <div className="text-xs font-medium text-neutral-500">
          Search for these roles (click to toggle):
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {[...profile.titles, ...customTitles].map((t) => {
            const on = selectedTitles.has(t);
            return (
              <button
                key={t}
                onClick={() => setSelectedTitles((s) => toggle(s, t))}
                className={`rounded px-2 py-0.5 text-xs transition ${
                  on ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-400 line-through"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTitle();
              }
            }}
            placeholder="Add a role the parser missed…"
            className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={addCustomTitle}
            disabled={!newTitle.trim()}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {/* Market + location */}
      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Country</span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
          Remote only
        </label>

        {country === "se" && (
          <div>
            <button
              onClick={() => setShowRegions((v) => !v)}
              className="text-sm text-indigo-600 hover:underline"
              disabled={remote}
            >
              Region: {remote ? "n/a (remote)" : regionLabel} {showRegions ? "▲" : "▼"}
            </button>
            {showRegions && !remote && (
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                {SWEDISH_REGIONS.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedRegions.has(r.id)}
                      onChange={() => setSelectedRegions((s) => toggle(s, r.id))}
                    />
                    {r.label.replace(" län", "")}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const results = matches.length > 0 && (() => {
    const dismissedCount = matches.filter((m) => m.status === "DISMISSED").length;
    const visible = matches
      .filter((m) => showDismissed || m.status !== "DISMISSED")
      .filter((m) => m.score >= minScore);
    const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const clampedPage = Math.min(page, totalPages - 1);
    const pageItems = visible.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

    return (
      <section className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{visible.length} matches</h2>
          <div className="flex items-center gap-3 text-xs">
            {/* Score threshold filter */}
            <div className="flex items-center gap-1 text-neutral-500">
              <span>Min score</span>
              {[0, 60, 80].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setMinScore(s);
                    setPage(0);
                  }}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    minScore === s ? "bg-indigo-600 text-white" : "border border-neutral-300 text-neutral-600 hover:border-neutral-500"
                  }`}
                >
                  {s === 0 ? "All" : `${s}+`}
                </button>
              ))}
            </div>
            {dismissedCount > 0 && (
              <button onClick={() => setShowDismissed((v) => !v)} className="text-neutral-500 hover:underline">
                {showDismissed ? "Hide" : "Show"} {dismissedCount} dismissed
              </button>
            )}
          </div>
        </div>

        {visible.length === 0 && (
          <p className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            No matches at this score threshold. Try a lower minimum.
          </p>
        )}

        {pageItems.map((m) => {
          const dismissed = m.status === "DISMISSED";
          return (
            <div
              key={m.id}
              className={`rounded-xl border bg-white p-4 shadow-sm ${dismissed ? "border-neutral-200 opacity-50" : "border-neutral-200"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <a href={m.job.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {m.job.headline}
                  </a>
                  <div className="text-sm text-neutral-500">
                    {[m.job.employer, m.job.location].filter(Boolean).join(" · ")}
                  </div>
                  <span className="mt-1 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                    {m.job.source}
                  </span>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(m.score)}`}>
                  {m.score}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-700">{m.rationale}</p>
              {m.gaps && m.gaps.toLowerCase() !== "none" && (
                <p className="mt-1 text-xs text-neutral-500">Gap: {m.gaps}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                {(["SAVED", "APPLIED"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => updateMatchStatus(m.id, m.status === st ? "NEW" : st)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                      m.status === st
                        ? st === "SAVED"
                          ? "bg-indigo-600 text-white"
                          : "bg-green-600 text-white"
                        : "border border-neutral-300 text-neutral-600 hover:border-neutral-500"
                    }`}
                  >
                    {st === "SAVED" ? "★ Saved" : "✓ Applied"}
                  </button>
                ))}
                <button
                  onClick={() => updateMatchStatus(m.id, dismissed ? "NEW" : "DISMISSED")}
                  className="ml-auto rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-800"
                >
                  {dismissed ? "Restore" : "Dismiss"}
                </button>
              </div>
            </div>
          );
        })}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2 text-sm">
            <button
              onClick={() => setPage(clampedPage - 1)}
              disabled={clampedPage === 0}
              className="rounded-md border border-neutral-300 px-3 py-1 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-neutral-500">
              Page {clampedPage + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(clampedPage + 1)}
              disabled={clampedPage >= totalPages - 1}
              className="rounded-md border border-neutral-300 px-3 py-1 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </section>
    );
  })();

  const feedback = (
    <>
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {health.map((h) => (
        <div
          key={h.source}
          className={`mt-4 rounded-md border p-2 text-xs ${
            h.status === "ok" ? "border-neutral-200 bg-white text-neutral-500" : "border-amber-300 bg-amber-50 text-amber-800"
          }`}
        >
          {h.status === "ok"
            ? `${h.source}: ${h.fetchedCount} jobs fetched`
            : h.error
              ? `⚠ ${h.source}: ${h.error}`
              : `⚠ ${h.source} returned 0 (no results for this search)`}
        </div>
      ))}
      {warning && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{warning}</div>
      )}
    </>
  );

  // ---- Screens -------------------------------------------------------------

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-20 text-center text-sm text-neutral-400">
        Loading…
      </main>
    );
  }

  // Onboarding: welcome
  // Onboarding: CV
  if (step === "cv") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="text-xs font-medium uppercase tracking-wide text-indigo-600">Step 1 of 2</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tell us about you</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Upload your CV, tell us what you&apos;re looking for, or both. We only keep the
          extracted details, never the file.
        </p>
        <div className="mt-6">{cvInput}</div>
        {feedback}
      </main>
    );
  }

  // Onboarding: confirm profile + country
  if (step === "confirm" && profile) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="text-xs font-medium uppercase tracking-wide text-indigo-600">Step 2 of 2</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Does this look right?</h1>
        <p className="mt-1 text-sm text-neutral-500">{profile.summary}</p>

        <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">{filterControls}</div>

        <button
          onClick={async () => {
            await findJobs();
            setStep(null);
          }}
          disabled={busy !== null || selectedTitles.size === 0}
          className="mt-5 rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy === "run" ? "Finding jobs…" : "Find my first jobs"}
        </button>
        {selectedTitles.size === 0 && (
          <p className="mt-1 text-xs text-amber-700">Select at least one role.</p>
        )}
        {feedback}
      </main>
    );
  }

  // The app (returning users, or after onboarding)
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Your job search</h1>
        <button
          onClick={() => {
            setCvText("");
            setStep("cv");
          }}
          className="text-xs text-neutral-500 hover:underline"
        >
          Use a new CV
        </button>
      </div>

      {profile && (
        <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-neutral-600">{profile.summary}</p>
          <div className="mt-3">{filterControls}</div>
          <button
            onClick={findJobs}
            disabled={busy !== null || selectedTitles.size === 0}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {busy === "run" ? "Finding jobs…" : "Find jobs"}
          </button>
        </section>
      )}

      {feedback}
      {results}
    </main>
  );
}
