"use client";

import { useState } from "react";
import { SWEDISH_REGIONS } from "@/lib/sources/regions";

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
}

export default function Home() {
  const [cvText, setCvText] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [customTitles, setCustomTitles] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(new Set());
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [remote, setRemote] = useState(false);
  const [showRegions, setShowRegions] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [busy, setBusy] = useState<null | "parse" | "upload" | "run">(null);
  const [error, setError] = useState<string | null>(null);

  function applyProfile(p: Profile) {
    setProfile(p);
    setCustomTitles([]);
    // Start with every extracted title selected; user can deselect.
    setSelectedTitles(new Set<string>(p.titles));
  }

  function addCustomTitle() {
    const t = newTitle.trim();
    if (!t) return;
    if (!customTitles.includes(t) && !(profile?.titles.includes(t))) {
      setCustomTitles((c) => [...c, t]);
    }
    setSelectedTitles((s) => new Set(s).add(t));
    setNewTitle("");
  }

  async function updateMatchStatus(id: string, status: string) {
    // Optimistic: update local state, then persist.
    setMatches((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));
    try {
      await fetch("/api/v1/match/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      // Non-fatal; the next run reloads authoritative state.
    }
  }

  async function saveProfile() {
    setBusy("parse");
    setError(null);
    try {
      const res = await fetch("/api/v1/parse-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Parse failed");
      applyProfile(data.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function uploadPdf(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/parse-cv-pdf", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "PDF parse failed");
      applyProfile(data.profile);
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Run failed");
      setMatches(data.matches ?? []);
      setHealth(data.health ?? []);
      setWarning(data.warning ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const scoreColor = (s: number) =>
    s >= 75 ? "bg-green-100 text-green-800" : s >= 50 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600";

  const regionLabel =
    selectedRegions.size === 0 ? "All of Sweden" : `${selectedRegions.size} region${selectedRegions.size > 1 ? "s" : ""}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Findmeajob</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Paste your CV, get a ranked list of jobs that fit. Phase 1: JobTech (Swedish market).
      </p>

      {/* Step 1: CV — upload a PDF or paste text. */}
      <section className="mt-8">
        <label className="block text-sm font-medium">Your CV</label>

        {/* PDF upload */}
        <div className="mt-2 flex items-center gap-3">
          <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:border-neutral-500">
            {busy === "upload" ? "Reading PDF…" : "Upload PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPdf(f);
                e.target.value = ""; // allow re-selecting the same file
              }}
            />
          </label>
          <span className="text-xs text-neutral-400">
            The file is read, parsed, and discarded — it is never stored.
          </span>
        </div>

        <div className="my-3 text-xs text-neutral-400">— or paste the text —</div>

        <textarea
          value={cvText}
          onChange={(e) => setCvText(e.target.value)}
          placeholder="Paste your CV text here…"
          rows={8}
          className="w-full rounded-md border border-neutral-300 p-3 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <button
          onClick={saveProfile}
          disabled={!cvText.trim() || busy !== null}
          className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy === "parse" ? "Reading CV…" : "Save profile"}
        </button>
      </section>

      {/* Extracted profile + filters */}
      {profile && (
        <section className="mt-6 rounded-md border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Extracted profile</h2>
          <p className="mt-1 text-sm text-neutral-600">{profile.summary}</p>

          {/* Deselectable title chips — only selected titles drive the search. */}
          <div className="mt-3">
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
                      on
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-100 text-neutral-400 line-through"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            {/* Add your own title */}
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
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs focus:border-neutral-500 focus:outline-none"
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

          {/* Location filters */}
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remote}
                onChange={(e) => setRemote(e.target.checked)}
              />
              Remote only
            </label>

            <div>
              <button
                onClick={() => setShowRegions((v) => !v)}
                className="text-sm text-blue-600 hover:underline"
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
          </div>

          <button
            onClick={findJobs}
            disabled={busy !== null || selectedTitles.size === 0}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy === "run" ? "Finding jobs…" : "Find jobs"}
          </button>
          {selectedTitles.size === 0 && (
            <p className="mt-1 text-xs text-amber-700">Select at least one role.</p>
          )}
        </section>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Source health (F3 empty-guard) */}
      {health.map((h) => (
        <div
          key={h.source}
          className={`mt-4 rounded-md border p-2 text-xs ${
            h.status === "ok"
              ? "border-neutral-200 bg-white text-neutral-500"
              : "border-amber-300 bg-amber-50 text-amber-800"
          }`}
        >
          {h.status === "ok"
            ? `${h.source}: ${h.fetchedCount} jobs fetched`
            : `⚠ ${h.source} returned ${h.fetchedCount} — check the source`}
        </div>
      ))}

      {/* Rerank warning — never leave "0 matches" unexplained. */}
      {warning && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {warning}
        </div>
      )}

      {/* Results */}
      {matches.length > 0 && (() => {
        const dismissedCount = matches.filter((m) => m.status === "DISMISSED").length;
        const visible = matches.filter(
          (m) => showDismissed || m.status !== "DISMISSED"
        );
        return (
          <section className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{visible.length} matches</h2>
              {dismissedCount > 0 && (
                <button
                  onClick={() => setShowDismissed((v) => !v)}
                  className="text-xs text-neutral-500 hover:underline"
                >
                  {showDismissed ? "Hide" : "Show"} {dismissedCount} dismissed
                </button>
              )}
            </div>
            {visible.map((m) => {
              const dismissed = m.status === "DISMISSED";
              return (
                <div
                  key={m.id}
                  className={`rounded-md border bg-white p-4 ${
                    dismissed ? "border-neutral-200 opacity-50" : "border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <a
                        href={m.job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                      >
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

                  {/* Status actions */}
                  <div className="mt-3 flex items-center gap-2">
                    {(["SAVED", "APPLIED"] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => updateMatchStatus(m.id, m.status === st ? "NEW" : st)}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                          m.status === st
                            ? st === "SAVED"
                              ? "bg-blue-600 text-white"
                              : "bg-green-600 text-white"
                            : "border border-neutral-300 text-neutral-600 hover:border-neutral-500"
                        }`}
                      >
                        {st === "SAVED" ? "★ Saved" : "✓ Applied"}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        updateMatchStatus(m.id, dismissed ? "NEW" : "DISMISSED")
                      }
                      className="ml-auto rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-800"
                    >
                      {dismissed ? "Restore" : "Dismiss"}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })()}
    </main>
  );
}
