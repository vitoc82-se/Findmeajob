import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignUpButton } from "@clerk/nextjs";

// Public landing page. The app itself lives at /app behind auth.
export default async function Landing() {
  const { userId } = await auth();

  const cta = userId ? (
    <Link
      href="/app"
      className="rounded-md bg-indigo-600 px-7 py-3 text-sm font-medium text-white hover:bg-indigo-700"
    >
      Go to your search →
    </Link>
  ) : (
    <SignUpButton mode="redirect" forceRedirectUrl="/app">
      <button className="rounded-md bg-indigo-600 px-7 py-3 text-sm font-medium text-white hover:bg-indigo-700">
        Get started — it&apos;s free
      </button>
    </SignUpButton>
  );

  return (
    <main className="mx-auto max-w-3xl px-6">
      {/* Hero */}
      <section className="py-20 text-center sm:py-28">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white">
          F
        </div>
        <h1 className="mx-auto mt-8 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Stop scrolling job boards.
          <br />
          <span className="text-indigo-600">Get matched instead.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600">
          Give Findmeajob your CV once. It searches real job sources for you and ranks the
          roles that actually fit — each with a note on why. No endless scrolling.
        </p>
        <div className="mt-9 flex flex-col items-center gap-3">
          {cta}
          <p className="text-xs text-neutral-400">
            100% free · No credit card · About a minute to set up
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-neutral-200 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              n: "1",
              t: "Tell us about you",
              d: "Upload your CV, or just describe what you're looking for. We keep the details, never the file.",
            },
            {
              n: "2",
              t: "We do the searching",
              d: "We pull from real job sources — Arbetsförmedlingen, remote boards, and more — not scraped listings.",
            },
            {
              n: "3",
              t: "Ranked matches, with reasons",
              d: "See the best-fit roles first, each scored with why it fits and where you fall short.",
            },
          ].map((s) => (
            <div key={s.n}>
              <div className="grid h-7 w-7 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                {s.n}
              </div>
              <h3 className="mt-3 font-medium">{s.t}</h3>
              <p className="mt-1 text-sm text-neutral-600">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why different */}
      <section className="border-t border-neutral-200 py-16 text-center">
        <h2 className="text-xl font-semibold tracking-tight">Not another board to scroll</h2>
        <p className="mx-auto mt-3 max-w-lg text-neutral-600">
          No spam, no noise, no dark patterns. Just the handful of jobs worth your time,
          matched to your actual experience and what you want next.
        </p>
        <div className="mt-8">{cta}</div>
      </section>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-400">
        Findmeajob · Free to use
      </footer>
    </main>
  );
}
