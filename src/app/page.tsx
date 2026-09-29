import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import LandingSearch from "@/components/LandingSearch";
import FunnelPing from "@/components/FunnelPing";
import { DICTS, LANG_COOKIE, parseLang, type Dict } from "@/lib/i18n";

// Public landing page. Logged-in users skip it entirely and go to the app.
// The hero IS the product's first step: type a job, pick a place, land on results.
export default async function Landing() {
  const { userId } = await auth();
  if (userId) redirect("/app");

  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const t = DICTS[lang];

  const examples =
    lang === "sv"
      ? ["Projektledare", "Sjuksköterska", "Lagerarbetare", "Utvecklare", "Säljare", "Ekonomi"]
      : ["Project manager", "Nurse", "Warehouse", "Developer", "Sales", "Accounting"];

  return (
    <main>
      <FunnelPing step="landing" />

      {/* Hero: one job, one form, one example of the result. */}
      <section className="border-b border-[color:var(--line)] bg-white">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-accent">{t.heroEyebrow}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{t.heroH1}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">{t.heroSub}</p>
            <div className="mt-8 max-w-md">
              <LandingSearch examples={examples} />
              <p className="mt-4 text-xs text-neutral-400">{t.heroNote}</p>
            </div>
          </div>

          <div className="lg:pt-9">
            <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              {t.sampleLabel}
            </div>
            <div className="mt-2 space-y-3">
              <SampleCard t={t} n={1} score={88} />
              <SampleCard t={t} n={2} score={71} />
              <SampleCard t={t} n={3} score={54} muted />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">{t.howLabel}</div>
        <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-[color:var(--line)] bg-[color:var(--line)] sm:grid-cols-3">
          {[
            { n: "01", h: t.h1t, d: t.h1d },
            { n: "02", h: t.h2t, d: t.h2d },
            { n: "03", h: t.h3t, d: t.h3d },
          ].map((s) => (
            <div key={s.n} className="bg-white p-6">
              <div className="font-mono text-xs text-neutral-400">{s.n}</div>
              <h3 className="mt-3 font-medium">{s.h}</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">{s.d}</p>
            </div>
          ))}
        </div>

        <ul className="mt-6 flex flex-col gap-2 text-sm text-neutral-600 sm:flex-row sm:gap-8">
          {[t.trust1, t.trust2, t.trust3].map((x) => (
            <li key={x} className="flex items-center gap-2">
              <span aria-hidden className="text-accent">
                ✓
              </span>
              {x}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-[color:var(--line)] bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">{t.finalH}</h2>
          <Link
            href="/try"
            className="rounded bg-ink px-6 py-3 text-sm font-medium text-white hover:opacity-90"
          >
            {t.finalCta} →
          </Link>
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-neutral-400">
        {t.footerFree}{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-neutral-600">
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
  const color =
    score >= 75 ? "bg-green-100 text-green-800" : score >= 50 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600";
  return (
    <div
      className={`rounded-lg border border-[color:var(--line)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        muted ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium leading-tight">{title}</div>
          <div className="mt-0.5 text-sm text-neutral-500">{meta}</div>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-semibold ${color}`}>{score}</span>
      </div>
      <p className="mt-2 text-sm text-neutral-700">{why}</p>
      <span className="mt-2 inline-block font-mono text-[10px] uppercase tracking-wider text-neutral-400">
        {t.sampleTag}
      </span>
    </div>
  );
}
