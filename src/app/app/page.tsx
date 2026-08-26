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
  jobId: string;
  score: number;
  rationale: string;
  gaps: string;
  status: string;
  job: MatchJob;
}

interface ApplyDoc {
  id: string;
  tailoredCv: string;
  coverLetter: string;
  language: string;
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
  const [view, setView] = useState<"search" | "saved">("search");
  const [savedMatches, setSavedMatches] = useState<Match[]>([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  // Apply-assist: which job's panel is open, per-job result, and busy job id.
  const [applyOpen, setApplyOpen] = useState<string | null>(null);
  const [applyDocs, setApplyDocs] = useState<Record<string, ApplyDoc>>({});
  const [applyBusy, setApplyBusy] = useState<string | null>(null);
  const [applyTab, setApplyTab] = useState<"cv" | "letter">("cv");
  const [digestEnabled, setDigestEnabled] = useState(false);
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
          loadSaved();
          fetch("/api/v1/digest-settings")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d && setDigestEnabled(Boolean(d.enabled)))
            .catch(() => {});
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

  async function loadSaved() {
    try {
      const res = await fetch("/api/v1/saved");
      if (res.ok) {
        const data = await res.json();
        setSavedMatches(data.matches ?? []);
      }
    } catch {
      /* non-fatal */
    } finally {
      setSavedLoaded(true);
    }
  }

  async function updateMatchStatus(id: string, status: string) {
    // Optimistic in both lists; the saved view filters to SAVED/APPLIED so an
    // un-saved item drops out immediately.
    setMatches((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));
    setSavedMatches((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));
    try {
      await fetch("/api/v1/match/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      /* next reload reconciles authoritative state */
    }
  }

  async function toggleDigest() {
    const next = !digestEnabled;
    setDigestEnabled(next);
    setError(null);
    try {
      const res = await fetch("/api/v1/digest-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: next,
          titles: [...selectedTitles],
          country,
          regions: [...selectedRegions],
          remote,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Could not save digest setting");
      }
    } catch (e) {
      setDigestEnabled(!next); // revert on failure
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function openApply(jobId: string) {
    if (applyOpen === jobId) {
      setApplyOpen(null);
      return;
    }
    setApplyOpen(jobId);
    setApplyTab("cv");
    if (!applyDocs[jobId]) {
      try {
        const res = await fetch(`/api/v1/apply-assist?jobId=${jobId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.doc) setApplyDocs((d) => ({ ...d, [jobId]: data.doc }));
        }
      } catch {
        /* non-fatal */
      }
    }
  }

  async function generateApply(jobId: string) {
    setApplyBusy(jobId);
    setError(null);
    try {
      const res = await fetch("/api/v1/apply-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Apply-assist failed");
      setApplyDocs((d) => ({ ...d, [jobId]: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyBusy(null);
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
          <div className="flex items-center gap-2 rounded-md border border-accent-soft bg-accent-soft px-3 py-2 text-sm">
            <span className="font-medium text-accent">✓ {cvFile.name}</span>
            <button
              onClick={() => setCvFile(null)}
              className="text-xs text-neutral-500 hover:text-neutral-800"
              disabled={busy !== null}
            >
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
        className="mt-1 w-full rounded-md border border-neutral-300 p-3 text-sm focus:border-accent focus:outline-none"
      />
      <p className="mt-1 text-xs text-neutral-400">
        No CV file? Just describe yourself and what you want here — that works too.
      </p>

      <button
        onClick={submitCv}
        disabled={!canSubmitCv}
        className="mt-3 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {busy === "upload" ? "Reading CV…" : busy === "parse" ? "Reading…" : "Continue"}
      </button>
    </div>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
      {children}
    </div>
  );

  const filterControls = profile && (
    <div className="space-y-6">
      {/* Roles */}
      <div>
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
      </div>

      {/* Where */}
      <div className="border-t border-[color:var(--line)] pt-6">
        <SectionLabel>Where</SectionLabel>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-neutral-500">Country</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-md border border-[color:var(--line)] px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
              className="accent-[color:var(--accent)]"
            />
            Remote only
          </label>
        </div>

        {country === "se" && (
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
          </div>
        )}
      </div>
    </div>
  );

  const matchCard = (m: Match) => {
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
          <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-semibold ${scoreColor(m.score)}`}>
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
                    ? "bg-ink text-white"
                    : "bg-green-600 text-white"
                  : "border border-neutral-300 text-neutral-600 hover:border-neutral-500"
              }`}
            >
              {st === "SAVED" ? "★ Saved" : "✓ Applied"}
            </button>
          ))}
          <button
            onClick={() => openApply(m.jobId)}
            className="rounded border border-accent px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent-soft"
          >
            ✍ Apply help
          </button>
          <button
            onClick={() => updateMatchStatus(m.id, dismissed ? "NEW" : "DISMISSED")}
            className="ml-auto rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-800"
          >
            {dismissed ? "Restore" : "Dismiss"}
          </button>
        </div>

        {applyOpen === m.jobId && (
          <div className="mt-3 rounded-lg border border-accent-soft bg-accent-soft/40 p-3">
            {applyBusy === m.jobId ? (
              <p className="text-sm text-neutral-500">
                Writing your tailored CV and cover letter… (~15s)
              </p>
            ) : !applyDocs[m.jobId] ? (
              <div>
                <p className="text-sm text-neutral-600">
                  Generate a CV and cover letter tailored to this job — honest, using only
                  what&apos;s truly in your CV.
                </p>
                <button
                  onClick={() => generateApply(m.jobId)}
                  className="mt-2 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Generate
                </button>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {(["cv", "letter"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setApplyTab(t)}
                      className={`rounded px-2 py-0.5 font-medium ${
                        applyTab === t ? "bg-ink text-white" : "border border-neutral-300 text-neutral-600"
                      }`}
                    >
                      {t === "cv"
                        ? "Tailored CV"
                        : applyDocs[m.jobId].language === "sv"
                          ? "Personligt brev"
                          : "Cover letter"}
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      navigator.clipboard?.writeText(
                        applyTab === "cv" ? applyDocs[m.jobId].tailoredCv : applyDocs[m.jobId].coverLetter
                      )
                    }
                    className="ml-auto text-neutral-500 hover:underline"
                  >
                    Copy
                  </button>
                  <a
                    href={`/api/v1/apply-assist/${applyDocs[m.jobId].id}/export?type=${applyTab}`}
                    className="text-accent hover:underline"
                  >
                    Download .docx
                  </a>
                  <button onClick={() => generateApply(m.jobId)} className="text-neutral-500 hover:underline">
                    Regenerate
                  </button>
                </div>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs text-neutral-800">
                  {applyTab === "cv" ? applyDocs[m.jobId].tailoredCv : applyDocs[m.jobId].coverLetter}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

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
                    minScore === s ? "bg-ink text-white" : "border border-neutral-300 text-neutral-600 hover:border-neutral-500"
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

        {pageItems.map((m) => matchCard(m))}

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

  // Collapse the per-source "ok" counts into one friendly total; keep the amber
  // lines so a real source outage (error / 0 results) still surfaces to the user.
  const okSources = health.filter((h) => h.status === "ok");
  const sourceProblems = health.filter((h) => h.status !== "ok");
  const totalFound = okSources.reduce((n, h) => n + h.fetchedCount, 0);

  const feedback = (
    <>
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {okSources.length > 0 && totalFound > 0 && (
        <div className="mt-4 rounded-md border border-[color:var(--line)] bg-white p-3 text-sm text-neutral-600">
          We found <span className="font-mono text-ink">{totalFound}</span> jobs for you.
        </div>
      )}
      {sourceProblems.map((h) => (
        <div
          key={h.source}
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
        >
          {h.error
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
        <div className="text-xs font-medium uppercase tracking-wide text-accent">Step 1 of 2</div>
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
        <div className="text-xs font-medium uppercase tracking-wide text-accent">Step 2 of 2</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Does this look right?</h1>
        <p className="mt-1 text-sm text-neutral-500">{profile.summary}</p>

        <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">{filterControls}</div>

        <button
          onClick={async () => {
            await findJobs();
            setStep(null);
          }}
          disabled={busy !== null || selectedTitles.size === 0}
          className="mt-5 rounded-md bg-ink px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
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
  const savedActive = savedMatches.filter((m) => m.status === "SAVED" || m.status === "APPLIED");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {view === "search" ? "Your job search" : "Saved jobs"}
        </h1>
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

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-neutral-200">
        <button
          onClick={() => setView("search")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
            view === "search" ? "border-ink text-ink" : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}
        >
          Search
        </button>
        <button
          onClick={() => {
            setView("saved");
            loadSaved();
          }}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
            view === "saved" ? "border-ink text-ink" : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}
        >
          Saved{savedLoaded ? ` (${savedActive.length})` : ""}
        </button>
      </div>

      {view === "search" ? (
        <>
          {profile && (
            <section className="mt-6 rounded-lg border border-[color:var(--line)] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {/* Your profile */}
              <SectionLabel>Your profile</SectionLabel>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{profile.summary}</p>

              <div className="mt-6 border-t border-[color:var(--line)] pt-6">{filterControls}</div>

              <button
                onClick={findJobs}
                disabled={busy !== null || selectedTitles.size === 0}
                className="mt-6 w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 sm:w-auto sm:px-6"
              >
                {busy === "run" ? "Finding jobs…" : "Find jobs"}
              </button>
            </section>
          )}

          {/* Daily digest — a quiet card of its own, not competing with the search */}
          {profile && (
            <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={digestEnabled}
                onChange={toggleDigest}
                disabled={selectedTitles.size === 0}
                className="mt-0.5 accent-[color:var(--accent)]"
              />
              <span>
                Email me new <strong className="font-mono text-ink">70+</strong> matches for this search each morning.
                <span className="block text-xs text-neutral-400">
                  Saves your current roles + filters. Unsubscribe any time.
                </span>
              </span>
            </label>
          )}
          {feedback}
          {results}
        </>
      ) : (
        <section className="mt-5 space-y-3">
          {!savedLoaded && <p className="text-sm text-neutral-400">Loading…</p>}
          {savedLoaded && savedActive.length === 0 && (
            <p className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500 shadow-sm">
              No saved jobs yet. Mark jobs ★ Saved or ✓ Applied from your search results and
              they&apos;ll collect here — across every search.
            </p>
          )}
          {savedActive.map((m) => matchCard(m))}
        </section>
      )}
    </main>
  );
}
