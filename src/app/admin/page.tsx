import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FUNNEL_STEPS } from "@/lib/funnel";

export const runtime = "nodejs";
// Always fresh — this is a live dashboard, never cache it.
export const dynamic = "force-dynamic";

// Owner-only usage dashboard. Gated by ADMIN_EMAILS (comma-separated list of the
// email(s) you sign into Findmeajob with). If ADMIN_EMAILS is unset, nobody gets
// in — a safe default. Everything shown comes from data the app already records
// (UsageEvent parse/run/apply, Profile, Match, Job) — no new tracking.
async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  if (!userId) notFound();

  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) notFound();

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = (
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    ""
  ).toLowerCase();

  if (!email || !allow.includes(email)) notFound();
}

const DAY = 24 * 60 * 60 * 1000;

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-sm font-semibold text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export default async function AdminPage() {
  await requireAdmin();

  const now = Date.now();
  const since7d = new Date(now - 7 * DAY);
  const since14d = new Date(now - 14 * DAY);

  const [
    onboarded,
    newUsers7d,
    digestOn,
    searches,
    searches7d,
    parses,
    applies,
    matches,
    jobs,
    activeRows,
    runRows,
    funnelRows,
    previewParses7d,
    previewRuns7d,
  ] = await Promise.all([
    prisma.profile.count(),
    prisma.profile.count({ where: { createdAt: { gte: since7d } } }),
    prisma.profile.count({ where: { digestEnabled: true } }),
    prisma.usageEvent.count({ where: { kind: "run" } }),
    prisma.usageEvent.count({ where: { kind: "run", at: { gte: since7d } } }),
    prisma.usageEvent.count({ where: { kind: "parse" } }),
    prisma.usageEvent.count({ where: { kind: "apply" } }),
    prisma.match.count(),
    prisma.job.count(),
    prisma.usageEvent.findMany({
      // Signed-in usage only: anonymous preview + funnel pings are keyed by IP.
      where: { at: { gte: since7d }, NOT: { userId: { startsWith: "ip:" } } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.usageEvent.findMany({
      where: { kind: "run", at: { gte: since14d } },
      select: { at: true },
    }),
    // Cookie-free visitor funnel (see lib/funnel.ts): one row per step ping.
    prisma.usageEvent.groupBy({
      by: ["kind"],
      where: { kind: { startsWith: "funnel_" }, at: { gte: since7d } },
      _count: { _all: true },
    }),
    prisma.usageEvent.count({ where: { kind: "preview_parse", at: { gte: since7d } } }),
    prisma.usageEvent.count({ where: { kind: "preview_run", at: { gte: since7d } } }),
  ]);
  // Kinds look like funnel_<step>_<src> or funnel_<step>_<src>|<campaign>.
  const parsedFunnel = funnelRows.flatMap((r) => {
    const m = /^funnel_(.+)_(fb|other)(?:\|(.+))?$/.exec(r.kind);
    return m ? [{ step: m[1], src: m[2], camp: m[3] ?? "", n: r._count._all }] : [];
  });
  const funnelCount = (step: string, src: "fb" | "other") =>
    parsedFunnel.filter((r) => r.step === step && r.src === src).reduce((a, r) => a + r.n, 0);
  const CAMP_STEPS = ["landing", "try_open", "results", "cv_added", "signup_click"] as const;
  const campaigns = [...new Set(parsedFunnel.filter((r) => r.camp).map((r) => r.camp))]
    .map((camp) => {
      const n = (step: string) => parsedFunnel.filter((r) => r.camp === camp && r.step === step).reduce((a, r) => a + r.n, 0);
      return { camp, counts: CAMP_STEPS.map((s) => n(s)) };
    })
    .sort((a, b) => b.counts[0] - a.counts[0]);

  // Bucket searches into the last 14 calendar days (local to the server).
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count: 0 });
  }
  const startDay = new Date(now - 13 * DAY);
  startDay.setHours(0, 0, 0, 0);
  for (const r of runRows) {
    const idx = Math.floor((r.at.getTime() - startDay.getTime()) / DAY);
    if (idx >= 0 && idx < 14) days[idx].count++;
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <span className="text-sm font-semibold text-neutral-500">
          Findmeajob usage
        </span>
      </div>

      {/* The funnel */}
      <section className="mt-6">
        <div className="text-sm font-semibold text-neutral-500">
          Funnel
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Onboarded" value={onboarded} sub="parsed a CV" />
          <Stat label="Searches" value={searches} sub={`${searches7d} in last 7d`} />
          <Stat label="Apply-assist" value={applies} sub="CV+letter generated" />
          <Stat label="Digest on" value={digestOn} sub="daily email opted in" />
        </div>
      </section>

      {/* Visitor funnel: where cold traffic drops off */}
      <section className="mt-8 rounded-xl border border-[color:var(--line)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold text-neutral-500">
            Visitor funnel (7d)
          </div>
          <div className="text-sm font-semibold text-neutral-500">
            searches run: {previewRuns7d} · CVs parsed: {previewParses7d}
          </div>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-sm font-semibold text-neutral-500">
              <th className="py-1 text-left font-medium">Step</th>
              <th className="py-1 text-right font-medium">From Facebook</th>
              <th className="py-1 text-right font-medium">Other</th>
            </tr>
          </thead>
          <tbody>
            {FUNNEL_STEPS.map((step) => (
              <tr key={step} className="border-t border-[color:var(--line)]">
                <td className="py-1.5 text-xs text-neutral-600">{step}</td>
                <td className="py-1.5 text-right tabular-nums">{funnelCount(step, "fb")}</td>
                <td className="py-1.5 text-right tabular-nums">{funnelCount(step, "other")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {campaigns.length > 0 && (
          <>
            <div className="mt-5 text-sm font-semibold text-neutral-500">By campaign / ad (utm_campaign.utm_content)</div>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-sm font-semibold text-neutral-500">
                  <th className="py-1 text-left font-medium">Campaign</th>
                  {CAMP_STEPS.map((s) => (
                    <th key={s} className="py-1 text-right text-xs font-medium">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.camp} className="border-t border-[color:var(--line)]">
                    <td className="py-1.5 text-xs text-neutral-600">{c.camp}</td>
                    {c.counts.map((n, i) => (
                      <td key={i} className="py-1.5 text-right tabular-nums">{n}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* Last 7 days */}
      <section className="mt-8">
        <div className="text-sm font-semibold text-neutral-500">
          Last 7 days
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Active users" value={activeRows.length} sub="ran any action" />
          <Stat label="New users" value={newUsers7d} sub="onboarded this week" />
          <Stat label="Searches" value={searches7d} />
        </div>
      </section>

      {/* Searches per day */}
      <section className="mt-8 rounded-xl border border-[color:var(--line)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="text-sm font-semibold text-neutral-500">
          Searches / day (14d)
        </div>
        <div className="mt-4 flex h-32 items-end gap-1.5">
          {days.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-accent/80"
                style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count > 0 ? 3 : 0 }}
                title={`${d.label}: ${d.count}`}
              />
              <span className="text-xs text-neutral-500">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Corpus */}
      <section className="mt-8">
        <div className="text-sm font-semibold text-neutral-500">
          Corpus
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Jobs stored" value={jobs} />
          <Stat label="Matches surfaced" value={matches} />
          <Stat label="CV parses" value={parses} />
        </div>
      </section>

      {/* Where the rest lives */}
      <p className="mt-8 text-xs leading-relaxed text-neutral-500">
        Visitors, Facebook referrers and countries are in <strong>Vercel → Analytics</strong>.
        Sign-ups and sign-in activity are in your <strong>Clerk dashboard</strong>. This page covers
        the in-app funnel only.
      </p>
    </main>
  );
}
