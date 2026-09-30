"use client";

import { useState } from "react";
import { useT } from "@/components/LangProvider";

// "Does this job fit?" thumbs on a result card. Sends one anonymous vote; the choice
// can be changed. Failures are silent: feedback must never get in the way.
export default function ResultFeedback({
  jobId,
  headline,
  score,
  query,
  level,
  region,
  surface,
}: {
  jobId: string;
  headline: string;
  score: number;
  query: string;
  level: string;
  region: string;
  surface: "try" | "app";
}) {
  const t = useT();
  const [vote, setVote] = useState<0 | 1 | -1>(0);

  function send(v: 1 | -1) {
    if (vote === v) return;
    setVote(v);
    fetch("/api/v1/preview/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, headline, vote: v, score, query, level, region, surface }),
      keepalive: true,
    }).catch(() => {});
  }

  const base = "rounded-full border px-2.5 py-0.5 text-xs font-medium transition";
  const off = "border-neutral-300 text-neutral-600 hover:border-neutral-500";
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t.fbQuestion}>
      <span className="mr-1 text-xs text-neutral-500">{vote === 0 ? t.fbQuestion : t.fbThanks}</span>
      <button
        type="button"
        onClick={() => send(1)}
        aria-pressed={vote === 1}
        className={`${base} ${vote === 1 ? "border-brand bg-brand text-white" : off}`}
      >
        {t.fbYes}
      </button>
      <button
        type="button"
        onClick={() => send(-1)}
        aria-pressed={vote === -1}
        className={`${base} ${vote === -1 ? "border-neutral-700 bg-neutral-700 text-white" : off}`}
      >
        {t.fbNo}
      </button>
    </div>
  );
}
