import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

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
      <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
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
      where: { at: { gte: since7d } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.usageEvent.findMany({
      where: { kind: "run", at: { gte: since14d } },
      select: { at: true },
    }),
  ]);

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
        <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
          Findmeajob usage
        </span>
      </div>

      {/* The funnel */}
      <section className="mt-6">
        <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          Funnel
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Onboarded" value={onboarded} sub="parsed a CV" />
          <Stat label="Searches" value={searches} sub={`${searches7d} in last 7d`} />
          <Stat label="Apply-assist" value={applies} sub="CV+letter generated" />
          <Stat label="Digest on" value={digestOn} sub="daily email opted in" />
        </div>
      </section>

      {/* Last 7 days */}
      <section className="mt-8">
        <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
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
        <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
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
              <span className="font-mono text-[9px] text-neutral-400">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Corpus */}
      <section className="mt-8">
        <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          Corpus
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Jobs stored" value={jobs} />
          <Stat label="Matches surfaced" value={matches} />
          <Stat label="CV parses" value={parses} />
        </div>
      </section>

      {/* Where the rest lives */}
      <p className="mt-8 text-xs leading-relaxed text-neutral-400">
        Visitors, Facebook referrers and countries are in <strong>Vercel → Analytics</strong>.
        Sign-ups and sign-in activity are in your <strong>Clerk dashboard</strong>. This page covers
        the in-app funnel only.
      </p>
    </main>
  );
}
