import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// Public landing page. Logged-in users skip it entirely and go to the app.
export default async function Landing() {
  const { userId } = await auth();
  if (userId) redirect("/app");

  // Primary CTA sends cold visitors straight into a no-signup trial — see your
  // matches first, create an account once you want to act on them.
  const cta = (
    <Link
      href="/try"
      className="rounded-lg bg-ink px-7 py-3 text-sm font-medium text-white shadow-sm shadow-black/20 transition hover:opacity-90"
    >
      Try it free — no sign-up
    </Link>
  );

  return (
    <main>
      {/* Hero with a soft gradient + a preview of the product */}
      <section className="relative overflow-hidden bg-gradient-to-b from-accent-soft via-white to-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-6 py-16 sm:py-24 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
              ● 100% free
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Stop scrolling job boards.
              <br />
              <span className="text-accent">Get matched instead.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 lg:mx-0">
              Give Findmeajob your CV once. It searches real job sources for you and ranks
              the roles that actually fit — each with a note on why. No endless scrolling.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 lg:items-start">
              {cta}
              <p className="text-xs text-neutral-400">
                No account needed to try · See your matches in ~30 seconds
              </p>
            </div>
          </div>

          {/* Preview: what a result looks like */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="rotate-[-2deg] rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl shadow-black/5">
              <div className="text-xs font-medium text-neutral-400">Your matches</div>
              <PreviewCard score={92} title="Senior Backend Engineer" company="Klarna · Stockholm" why="Strong match on Python, distributed systems, and your fintech background." />
              <PreviewCard score={78} title="Engineering Manager" company="Remote · EU" why="Fits your team-lead intent; light on people-management history." />
              <PreviewCard score={64} title="Platform Engineer" company="Spotify · Remote" why="Good infra overlap; less Kubernetes than they'd like." muted />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            { n: "1", icon: "📄", t: "Tell us about you", d: "Upload your CV, or just describe what you're looking for. We keep the details, never the file." },
            { n: "2", icon: "🔎", t: "We do the searching", d: "We pull from real job sources — Arbetsförmedlingen, remote boards, and more — not scraped listings." },
            { n: "3", icon: "🎯", t: "Ranked matches, with reasons", d: "See the best-fit roles first, each scored with why it fits and where you fall short." },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-lg">
                {s.icon}
              </div>
              <h3 className="mt-3 font-medium">{s.t}</h3>
              <p className="mt-1 text-sm text-neutral-600">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why different */}
      <section className="bg-neutral-900 text-center text-white">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Not another board to scroll</h2>
          <p className="mx-auto mt-3 max-w-lg text-neutral-300">
            No spam, no noise, no dark patterns. Just the handful of jobs worth your time,
            matched to your actual experience and what you want next.
          </p>
          <div className="mt-8">
            <Link
              href="/try"
              className="rounded-lg bg-white px-7 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200"
            >
              Try it free — no sign-up
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-400">
        Findmeajob · Free to use ·{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-neutral-600">
          Privacy
        </a>
      </footer>
    </main>
  );
}

function PreviewCard({
  score,
  title,
  company,
  why,
  muted,
}: {
  score: number;
  title: string;
  company: string;
  why: string;
  muted?: boolean;
}) {
  const color =
    score >= 75 ? "bg-green-100 text-green-800" : score >= 50 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600";
  return (
    <div className={`mt-2 rounded-lg border border-neutral-100 p-3 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium leading-tight">{title}</div>
          <div className="text-xs text-neutral-500">{company}</div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${color}`}>{score}</span>
      </div>
      <p className="mt-1.5 text-xs text-neutral-600">{why}</p>
    </div>
  );
}
