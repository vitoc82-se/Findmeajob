"use client";

import { useState } from "react";

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
  const [matches, setMatches] = useState<Match[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [busy, setBusy] = useState<null | "parse" | "run">(null);
  const [error, setError] = useState<string | null>(null);

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
      setProfile(data.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function findJobs() {
    setBusy("run");
    setError(null);
    try {
      const res = await fetch("/api/v1/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Run failed");
      setMatches(data.matches ?? []);
      setHealth(data.health ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const scoreColor = (s: number) =>
    s >= 75 ? "bg-green-100 text-green-800" : s >= 50 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Findmeajob</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Paste your CV, get a ranked list of jobs that fit. Phase 1: JobTech (Swedish market).
      </p>

      {/* Step 1: CV */}
      <section className="mt-8">
        <label className="block text-sm font-medium">Your CV</label>
        <textarea
          value={cvText}
          onChange={(e) => setCvText(e.target.value)}
          placeholder="Paste your CV text here…"
          rows={10}
          className="mt-2 w-full rounded-md border border-neutral-300 p-3 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <button
          onClick={saveProfile}
          disabled={!cvText.trim() || busy !== null}
          className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy === "parse" ? "Reading CV…" : "Save profile"}
        </button>
      </section>

      {/* Extracted profile */}
      {profile && (
        <section className="mt-6 rounded-md border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Extracted profile</h2>
          <p className="mt-1 text-sm text-neutral-600">{profile.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {profile.titles.map((t) => (
              <span key={t} className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </div>
          <button
            onClick={findJobs}
            disabled={busy !== null}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy === "run" ? "Finding jobs…" : "Find jobs"}
          </button>
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

      {/* Results */}
      {matches.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold">{matches.length} matches</h2>
          {matches.map((m) => (
            <a
              key={m.id}
              href={m.job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border border-neutral-200 bg-white p-4 hover:border-neutral-400"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{m.job.headline}</div>
                  <div className="text-sm text-neutral-500">
                    {[m.job.employer, m.job.location].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(m.score)}`}>
                  {m.score}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-700">{m.rationale}</p>
              {m.gaps && m.gaps.toLowerCase() !== "none" && (
                <p className="mt-1 text-xs text-neutral-500">Gap: {m.gaps}</p>
              )}
            </a>
          ))}
        </section>
      )}
    </main>
  );
}
