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
      >
        <label htmlFor="q" className="text-sm font-semibold text-ink">
          {t.qLabel}
        </label>
        <input
          id="q"
          name="q"
          required
          autoComplete="off"
          placeholder={t.qPlaceholder}
          className="mt-2 w-full rounded border-[1.5px] border-mint-border bg-white px-3.5 py-3.5 text-[17px] focus:border-brand focus:outline-none"
        />
        <label htmlFor="r" className="mt-4 block text-sm font-semibold text-ink">
          {t.regionLabel}
        </label>
        <select
          id="r"
          name="r"
          defaultValue=""
          className="mt-2 w-full rounded border-[1.5px] border-mint-border bg-white px-3.5 py-3.5 text-[17px] focus:border-brand focus:outline-none"
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
          className="mt-5 w-full rounded-full bg-brand px-5 py-4 text-[17px] font-bold text-white hover:bg-brand-dark"
        >
          {t.searchBtn} →
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-sm font-semibold text-neutral-500">{t.tryLabel}</span>
        {examples.map((e) => (
          <a
            key={e}
            href={`/try?q=${encodeURIComponent(e)}`}
            onClick={() => trackFunnel("landing_search")}
            className="rounded-full border border-mint-border bg-white px-3.5 py-1.5 text-sm font-medium text-ink hover:border-brand"
          >
            {e}
          </a>
        ))}
      </div>
    </div>
  );
}
