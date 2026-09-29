"use client";

import { useEffect, useState } from "react";
import { SWEDISH_REGIONS } from "@/lib/sources/regions";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/sources/countries";
import { fbTrack, fbTrackOnce } from "@/lib/fbpixel";
import { safeHref } from "@/lib/url";
import { fmt, type Dict } from "@/lib/i18n";
import { useLang, useT } from "@/components/LangProvider";

// Server messages are already written for people. Browser-level failures (dropped
// connection, non-JSON error page) would read as "Failed to fetch": swap those out.
function friendlyError(e: unknown, t: Dict): string {
  if (e instanceof TypeError || e instanceof SyntaxError || !(e instanceof Error)) return t.aGeneric;
  return e.message || t.aGeneric;
}

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

// Full-screen search overlay. Search can take ~30s (multi-source fetch + dedup +
// embedding rank + LLM rerank), so we show a live, moving indicator: an elapsed
// counter, an accent progress bar that eases toward ~95% (never completing until
// the real response lands), and status text stepping through the actual pipeline
// stages. Calm + sharp per DESIGN.md — one accent bar, hairlines, mono micro-labels.
const SEARCH_STAGE_AT = [0, 5, 11, 17, 25];

function SearchingOverlay() {
  const t = useT();
  const stages = [t.p0, t.p1, t.p2, t.p3, t.p4].map((label, i) => ({ at: SEARCH_STAGE_AT[i], label }));
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 150);
    return () => clearInterval(id);
  }, []);

  const secs = Math.floor(elapsedMs / 1000);
  const sec = elapsedMs / 1000;
  // Fast early, asymptotically approaching 95% — reads as progress without ever
  // pretending to finish before the server does.
  const progress = Math.min(95, Math.round(95 * (1 - Math.exp(-sec / 10))));
  const stage = [...stages].reverse().find((s) => secs >= s.at) ?? stages[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 px-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-[color:var(--line)] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-500">
            {t.searchEyebrow}
          </span>
          <span className="text-xs tabular-nums text-neutral-500">{secs}s</span>
        </div>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">{t.searchTitle}</h2>
        <p key={stage.at} className="mt-1 text-sm text-neutral-500">
          {stage.label}
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          {t.searchTail}
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const t = useT();
  const lang = useLang();
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
  // Optional headshot per job for the CV PDF — held client-side, sent only at
  // download time, never stored server-side.
  const [applyPhoto, setApplyPhoto] = useState<Record<string, File | null>>({});
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
    const title = newTitle.trim();
    if (!title) return;
    if (!customTitles.includes(title) && !profile?.titles.includes(title)) {
      setCustomTitles((c) => [...c, title]);
    }
    setSelectedTitles((s) => new Set(s).add(title));
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
        if (!res.ok) throw new Error(data.error || t.aGeneric);
      } else {
        setBusy("parse");
        const res = await fetch("/api/v1/parse-cv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvText: intent }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || t.aGeneric);
      }
      if (data.profile) {
        applyProfile(data.profile);
        // Signup conversion — once per browser, only if the pixel is live.
        fbTrackOnce("CompleteRegistration", "registration");
      }
      if (step) setStep("confirm");
    } catch (e) {
      setError(friendlyError(e, t));
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
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.aGeneric);
      setMatches(data.matches ?? []);
      setHealth(data.health ?? []);
      setWarning(data.warning ? t.warnSources : null);
      setPage(0);
      fbTrack("Search"); // engagement signal for ad optimization / retargeting
    } catch (e) {
      setError(friendlyError(e, t));
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
        throw new Error(d.error || t.aGeneric);
      }
    } catch (e) {
      setDigestEnabled(!next); // revert on failure
      setError(friendlyError(e, t));
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
      if (!res.ok) throw new Error(data.error || t.aGeneric);
      setApplyDocs((d) => ({ ...d, [jobId]: data }));
    } catch (e) {
      setError(friendlyError(e, t));
    } finally {
      setApplyBusy(null);
    }
  }

  // Download a styled PDF of the tailored CV or cover letter. For the CV we POST
  // the optional headshot as multipart (embedded server-side into the PDF, never
  // stored); everything else is a plain POST.
  async function downloadPdf(jobId: string, docId: string, type: "cv" | "letter") {
    setError(null);
    try {
      const photo = type === "cv" ? applyPhoto[jobId] : null;
      const init: RequestInit = { method: "POST" };
      if (photo) {
        const form = new FormData();
        form.append("photo", photo);
        init.body = form;
      }
      const res = await fetch(`/api/v1/apply-assist/${docId}/pdf?type=${type}`, init);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || t.aGeneric);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = type === "cv" ? "cv.pdf" : "cover-letter.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(friendlyError(e, t));
    }
  }

  const scoreColor = (s: number) =>
    s >= 75 ? "bg-sun text-ink" : s >= 50 ? "bg-sun-soft text-ink" : "border border-neutral-300 bg-white text-neutral-600";

  const regionLabel =
    selectedRegions.size === 0
      ? t.allSweden
      : selectedRegions.size === 1
        ? t.aRegionOne
        : fmt(t.aRegionMany, { n: selectedRegions.size });
  const countryName = (code: string, fallback: string) => {
    try {
      return new Intl.DisplayNames([lang], { type: "region" }).of(code.toUpperCase()) ?? fallback;
    } catch {
      return fallback;
    }
  };

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
              {t.aRemove}
            </button>
          </div>
        ) : (
          <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:border-accent">
            {t.aUpload}
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
        <span className="text-xs text-neutral-500">
          {t.aFileNote}
        </span>
      </div>

      {/* Intent — what they actually want */}
      <label className="mt-4 block text-sm font-medium">
        {t.aIntentLabel}{" "}
        <span className="font-normal text-neutral-500">{t.aIntentHint}</span>
      </label>
      <textarea
        value={cvText}
        onChange={(e) => setCvText(e.target.value)}
        placeholder={t.aIntentPh}
        rows={4}
        className="mt-1 w-full rounded-md border border-neutral-300 p-3 text-sm focus:border-accent focus:outline-none"
      />
      <p className="mt-1 text-xs text-neutral-500">
        {t.aIntentNote}
      </p>

      <button
        onClick={submitCv}
        disabled={!canSubmitCv}
        className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {busy === "upload" ? t.aReadingCv : busy === "parse" ? t.aReading : t.aContinue}
      </button>
    </div>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-sm font-semibold text-neutral-500">
      {children}
    </div>
  );

  const filterControls = profile && (
    <div className="space-y-6">
      {/* Roles */}
      <div>
        <SectionLabel>{t.aRolesLabel}</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...profile.titles, ...customTitles].map((title) => {
            const on = selectedTitles.has(title);
            return (
              <button
                key={title}
                onClick={() => setSelectedTitles((s) => toggle(s, title))}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  on ? "bg-brand text-white" : "border border-[color:var(--line)] bg-white text-neutral-500 hover:border-neutral-400"
                }`}
              >
                {title}
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
            placeholder={t.aAddRole}
            className="flex-1 rounded-md border border-[color:var(--line)] px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
          />
          <button
            onClick={addCustomTitle}
            disabled={!newTitle.trim()}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:border-neutral-500 disabled:opacity-40"
          >
            {t.aAdd}
          </button>
        </div>
      </div>

      {/* Where */}
      <div className="border-t border-[color:var(--line)] pt-6">
        <SectionLabel>{t.aWhere}</SectionLabel>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-neutral-500">{t.aCountry}</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-md border border-[color:var(--line)] px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {countryName(c.code, c.label)}
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
            {t.aRemoteOnly}
          </label>
        </div>

        {country === "se" && (
          <div className="mt-2">
            <button
              onClick={() => setShowRegions((v) => !v)}
              className="text-sm text-accent hover:underline disabled:text-neutral-300 disabled:no-underline"
              disabled={remote}
            >
              {t.aRegionLabel}: {remote ? t.aRegionNA : regionLabel} {showRegions ? "▲" : "▼"}
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
            <a href={safeHref(m.job.url)} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
              {m.job.headline}
            </a>
            <div className="text-sm text-neutral-500">
              {[m.job.employer, m.job.location].filter(Boolean).join(" · ")}
            </div>
            <span className="mt-1 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
              {m.job.source}
            </span>
          </div>
          <span className={`stamp grid h-12 w-12 shrink-0 place-items-center rounded-[14px] font-display text-xl font-extrabold ${scoreColor(m.score)}`}>
            {m.score}
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-700">{m.rationale}</p>
        {m.gaps && !/^(none|inga|ingen)\b/i.test(m.gaps.trim()) && (
          <p className="mt-1 text-sm text-neutral-500">{fmt(t.aGap, { g: m.gaps })}</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          {(["SAVED", "APPLIED"] as const).map((st) => (
            <button
              key={st}
              onClick={() => updateMatchStatus(m.id, m.status === st ? "NEW" : st)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                m.status === st
                  ? st === "SAVED"
                    ? "bg-brand text-white"
                    : "bg-green-600 text-white"
                  : "border border-neutral-300 text-neutral-600 hover:border-neutral-500"
              }`}
            >
              {st === "SAVED" ? t.aSaved : t.aApplied}
            </button>
          ))}
          <button
            onClick={() => openApply(m.jobId)}
            className="rounded border border-accent px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent-soft"
          >
            {t.aHelp}
          </button>
          <button
            onClick={() => updateMatchStatus(m.id, dismissed ? "NEW" : "DISMISSED")}
            className="ml-auto rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-800"
          >
            {dismissed ? t.aRestore : t.aDismiss}
          </button>
        </div>

        {applyOpen === m.jobId && (
          <div className="mt-3 rounded-lg border border-accent-soft bg-accent-soft/40 p-3">
            {applyBusy === m.jobId ? (
              <p className="text-sm text-neutral-500">
                {t.aWriting}
              </p>
            ) : !applyDocs[m.jobId] ? (
              <div>
                <p className="text-sm text-neutral-600">
                  {t.aGenIntro}
                </p>
                <button
                  onClick={() => generateApply(m.jobId)}
                  className="mt-2 rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  {t.aGenerate}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {(["cv", "letter"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setApplyTab(tab)}
                      className={`rounded px-2 py-0.5 font-medium ${
                        applyTab === tab ? "bg-brand text-white" : "border border-neutral-300 text-neutral-600"
                      }`}
                    >
                      {tab === "cv"
                        ? t.aTabCv
                        : applyDocs[m.jobId].language === "sv"
                          ? t.aLetterSv
                          : t.aLetterEn}
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
                    {t.aCopy}
                  </button>
                  <button
                    onClick={() => downloadPdf(m.jobId, applyDocs[m.jobId].id, applyTab)}
                    className="font-medium text-accent hover:underline"
                  >
                    {t.aDownload}
                  </button>
                  <button onClick={() => generateApply(m.jobId)} className="text-neutral-500 hover:underline">
                    {t.aRegen}
                  </button>
                </div>

                {/* Optional headshot for the CV PDF (Sweden-standard; never stored). */}
                {applyTab === "cv" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    {applyPhoto[m.jobId] ? (
                      <>
                        <span className="font-medium text-accent">{t.aPhotoAdded}</span>
                        <button
                          onClick={() => setApplyPhoto((p) => ({ ...p, [m.jobId]: null }))}
                          className="hover:underline"
                        >
                          {t.aRemove}
                        </button>
                      </>
                    ) : (
                      <label className="cursor-pointer font-medium text-accent hover:underline">
                        {t.aAddPhoto}
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) setApplyPhoto((p) => ({ ...p, [m.jobId]: f }));
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    <span className="text-neutral-500">{t.aPhotoNote}</span>
                  </div>
                )}

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
          <h2 className="text-sm font-semibold">{fmt(t.aMatchesN, { n: visible.length })}</h2>
          <div className="flex items-center gap-3 text-xs">
            {/* Score threshold filter */}
            <div className="flex items-center gap-1 text-neutral-500">
              <span>{t.aMinScore}</span>
              {[0, 60, 80].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setMinScore(s);
                    setPage(0);
                  }}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    minScore === s ? "bg-brand text-white" : "border border-neutral-300 text-neutral-600 hover:border-neutral-500"
                  }`}
                >
                  {s === 0 ? t.aAll : `${s}+`}
                </button>
              ))}
            </div>
            {dismissedCount > 0 && (
              <button onClick={() => setShowDismissed((v) => !v)} className="text-neutral-500 hover:underline">
                {fmt(showDismissed ? t.aHideDismissed : t.aShowDismissed, { n: dismissedCount })}
              </button>
            )}
          </div>
        </div>

        {visible.length === 0 && (
          <p className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            {t.aNoScore}
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
              {t.aPrev}
            </button>
            <span className="text-neutral-500">
              {fmt(t.aPage, { a: clampedPage + 1, b: totalPages })}
            </span>
            <button
              onClick={() => setPage(clampedPage + 1)}
              disabled={clampedPage >= totalPages - 1}
              className="rounded-md border border-neutral-300 px-3 py-1 disabled:opacity-40"
            >
              {t.aNext}
            </button>
          </div>
        )}
      </section>
    );
  })();

  // Report the number of ranked matches we actually show (deduped + scored,
  // including cross-run recall) so this agrees with the "N matches" header — the
  // raw per-source fetch count was a different, larger/smaller number. Keep the
  // amber lines so a real source outage (error / 0 results) still surfaces.
  const sourceProblems = health.filter((h) => h.status !== "ok");

  const feedback = (
    <>
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {matches.length > 0 && (
        <div className="mt-4 rounded-md border border-[color:var(--line)] bg-white p-3 text-sm text-neutral-600">
          {fmt(t.aFound, { n: matches.length })}
        </div>
      )}
      {sourceProblems.map((h) => (
        <div
          key={h.source}
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
        >
          {h.error ? fmt(t.aSrcErr, { s: h.source, e: h.error }) : fmt(t.aSrcZero, { s: h.source })}
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
      <main className="mx-auto max-w-3xl px-6 py-20 text-center text-sm text-neutral-500">
        {t.aLoading}
      </main>
    );
  }

  // Onboarding: welcome
  // Onboarding: CV
  if (step === "cv") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="text-sm font-semibold text-brand">{t.aStep1}</div>
        <h1 className="mt-1 font-display text-3xl font-extrabold">{t.aCvH1}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {t.aCvSub}
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
        {busy === "run" && <SearchingOverlay />}
        <div className="text-sm font-semibold text-brand">{t.aStep2}</div>
        <h1 className="mt-1 font-display text-3xl font-extrabold">{t.aConfirmH1}</h1>
        <p className="mt-1 text-sm text-neutral-500">{profile.summary}</p>

        <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">{filterControls}</div>

        <button
          onClick={async () => {
            await findJobs();
            setStep(null);
          }}
          disabled={busy !== null || selectedTitles.size === 0}
          className="mt-5 rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy === "run" ? t.aFinding : t.aFindFirst}
        </button>
        {selectedTitles.size === 0 && (
          <p className="mt-1 text-sm text-amber-700">{t.aPickRole}</p>
        )}
        {feedback}
      </main>
    );
  }

  // The app (returning users, or after onboarding)
  const savedActive = savedMatches.filter((m) => m.status === "SAVED" || m.status === "APPLIED");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {busy === "run" && <SearchingOverlay />}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold">
          {view === "search" ? t.aTitleSearch : t.aTitleSaved}
        </h1>
        <button
          onClick={() => {
            setCvText("");
            setStep("cv");
          }}
          className="text-xs text-neutral-500 hover:underline"
        >
          {t.aNewCv}
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
          {t.aTabSearch}
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
          {t.aTabSaved}{savedLoaded ? ` (${savedActive.length})` : ""}
        </button>
      </div>

      {view === "search" ? (
        <>
          {profile && (
            <section className="mt-6 rounded-lg border border-[color:var(--line)] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {/* Your profile */}
              <SectionLabel>{t.aProfile}</SectionLabel>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{profile.summary}</p>

              <div className="mt-6 border-t border-[color:var(--line)] pt-6">{filterControls}</div>

              <button
                onClick={findJobs}
                disabled={busy !== null || selectedTitles.size === 0}
                className="mt-6 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 sm:w-auto sm:px-6"
              >
                {busy === "run" ? t.aFinding : t.aFind}
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
                {t.aDigest}
                <span className="block text-sm text-neutral-500">{t.aDigestSub}</span>
              </span>
            </label>
          )}
          {feedback}
          {results}
        </>
      ) : (
        <section className="mt-5 space-y-3">
          {!savedLoaded && <p className="text-sm text-neutral-500">{t.aLoading}</p>}
          {savedLoaded && savedActive.length === 0 && (
            <p className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500 shadow-sm">
              {t.aSavedEmpty}
            </p>
          )}
          {savedActive.map((m) => matchCard(m))}
        </section>
      )}
    </main>
  );
}
