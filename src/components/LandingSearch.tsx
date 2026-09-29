"use client";

import { REGION_OPTIONS } from "@/lib/sources/regions";
import { trackFunnel } from "@/lib/funnel";
import { useT } from "./LangProvider";

// The landing page's start-here form. A plain GET form to /try (works without JS);
// /try reads ?q= & ?r= and runs the search immediately, so the visitor lands on
// results, not on another form.
export default function LandingSearch({ examples }: { examples: string[] }) {
  const t = useT();
  return (
    <div>
      <form
        action="/try"
        method="get"
        onSubmit={() => trackFunnel("landing_search")}
        className="rounded-lg border border-[color:var(--line)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <label htmlFor="q" className="font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          {t.qLabel}
        </label>
        <input
          id="q"
          name="q"
          required
          autoComplete="off"
          placeholder={t.qPlaceholder}
          className="mt-2 w-full rounded border border-[color:var(--line)] px-3 py-2.5 text-base focus:border-accent focus:outline-none"
        />
        <label htmlFor="r" className="mt-4 block font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          {t.regionLabel}
        </label>
        <select
          id="r"
          name="r"
          defaultValue=""
          className="mt-2 w-full rounded border border-[color:var(--line)] bg-white px-3 py-2.5 text-base focus:border-accent focus:outline-none"
        >
          <option value="">{t.allSweden}</option>
          <option value="remote">{t.remoteOnly}</option>
          {REGION_OPTIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="mt-4 w-full rounded bg-ink px-5 py-3 text-sm font-medium text-white hover:opacity-90"
        >
          {t.searchBtn} →
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">{t.tryLabel}</span>
        {examples.map((e) => (
          <a
            key={e}
            href={`/try?q=${encodeURIComponent(e)}`}
            onClick={() => trackFunnel("landing_search")}
            className="rounded border border-[color:var(--line)] bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 hover:text-ink"
          >
            {e}
          </a>
        ))}
      </div>
    </div>
  );
}
