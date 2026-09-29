"use client";

import Link from "next/link";
import LandingSearch from "@/components/LandingSearch";
import FunnelPing from "@/components/FunnelPing";
import { useLang, useT } from "@/components/LangProvider";
import type { Dict } from "@/lib/i18n";

// The landing page body. A client component only so the SV/EN toggle can swap the
// text instantly; it is still rendered to static HTML (in Swedish) at build time.
export default function LandingView() {
  const t = useT();
  const lang = useLang();
  const examples =
    lang === "sv"
      ? ["Projektledare", "Sjuksköterska", "Lagerarbetare", "Utvecklare", "Säljare", "Ekonomi"]
      : ["Project manager", "Nurse", "Warehouse", "Developer", "Sales", "Accounting"];

  return (
    <main>
      <FunnelPing step="landing" />

      {/* Hero: one job, one form, one example of the result. */}
      <section className="bg-mint">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="font-display text-[2.25rem] font-extrabold leading-[1.05] sm:text-5xl">{t.heroH1}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">{t.heroSub}</p>
            <div className="mt-7 max-w-md">
              <LandingSearch examples={examples} />
              <p className="mt-4 text-sm text-neutral-600">{t.heroNote}</p>
            </div>
          </div>

          <div className="lg:pt-2">
            <div className="text-sm font-semibold text-neutral-600">{t.sampleLabel}</div>
            <div className="mt-3 space-y-3">
              <SampleCard t={t} n={1} score={88} />
              <SampleCard t={t} n={2} score={71} />
              <SampleCard t={t} n={3} score={54} muted />
            </div>
          </div>
        </div>
      </section>

      {/* Trust: a real person, a real claim. */}
      <section className="mx-auto max-w-5xl px-5 pt-10 sm:px-6">
        <figure className="max-w-2xl rounded-lg bg-brand p-6 text-white sm:p-8">
          <blockquote className="font-display text-xl font-medium leading-snug sm:text-2xl">“{t.noteQuote}”</blockquote>
          <figcaption className="mt-4 text-sm text-white/85">{t.noteBy}</figcaption>
        </figure>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-5 py-12 sm:px-6">
        <h2 className="font-display text-2xl font-bold">{t.howLabel}</h2>
        <ol className="mt-4 max-w-2xl">
          {[
            { n: "1", h: t.h1t, d: t.h1d },
            { n: "2", h: t.h2t, d: t.h2d },
            { n: "3", h: t.h3t, d: t.h3d },
          ].map((s) => (
            <li key={s.n} className="grid grid-cols-[2rem_1fr] gap-3 border-t border-[color:var(--line)] py-4">
              <span className="font-display text-2xl font-extrabold text-brand">{s.n}</span>
              <div>
                <h3 className="font-semibold">{s.h}</h3>
                <p className="mt-1 text-neutral-600">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <ul className="mt-4 flex flex-col gap-2 text-neutral-600 sm:flex-row sm:gap-8">
          {[t.trust1, t.trust2, t.trust3].map((x) => (
            <li key={x} className="flex items-center gap-2">
              <span aria-hidden className="font-bold text-brand">
                ✓
              </span>
              {x}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-mint">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <h2 className="font-display text-2xl font-bold">{t.finalH}</h2>
          <Link
            href="/try"
            className="rounded-full bg-brand px-7 py-3.5 text-[17px] font-bold text-white hover:bg-brand-dark"
          >
            {t.finalCta} →
          </Link>
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-neutral-500">
        {t.footerFree}{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-ink">
          {t.privacy}
        </a>
      </footer>
    </main>
  );
}

// A clearly labelled example, not a real listing. Score badge follows the
// DESIGN.md semantic scale (green / amber / neutral) in Geist Mono.
function SampleCard({ t, n, score, muted }: { t: Dict; n: 1 | 2 | 3; score: number; muted?: boolean }) {
  const title = t[`s${n}Title` as const];
  const meta = t[`s${n}Meta` as const];
  const why = t[`s${n}Why` as const];
  const color = score >= 75 ? "bg-sun text-ink" : score >= 60 ? "bg-sun-soft text-ink" : "border border-neutral-300 bg-white text-neutral-600";
  return (
    <div className={`grid grid-cols-[auto_1fr] gap-4 rounded-lg border border-[color:var(--line)] bg-white p-4 ${muted ? "opacity-70" : ""}`}>
      <span className={`stamp grid h-12 w-12 place-items-center rounded-[14px] font-display text-xl font-extrabold ${color}`}>
        {score}
      </span>
      <div>
        <div className="text-lg font-bold leading-tight">{title}</div>
        <div className="mt-0.5 text-sm text-neutral-600">{meta}</div>
        <p className="mt-2 text-[15px]">{why}</p>
        <span className="mt-2 inline-block text-xs font-medium text-neutral-500">{t.sampleTag}</span>
      </div>
    </div>
  );
}
