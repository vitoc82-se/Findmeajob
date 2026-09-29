"use client";

import type { Lang } from "@/lib/i18n";
import { useLang, useSetLang } from "./LangProvider";

// SV | EN toggle. Applies instantly on the client and remembers the choice in a
// first-party cookie (strictly functional).
export default function LangSwitch() {
  const lang = useLang();
  const setLang = useSetLang();

  const btn = (l: Lang) => (
    <button
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      className={`rounded px-2 py-2 text-sm uppercase ${
        lang === l ? "font-bold text-ink" : "font-medium text-neutral-500 hover:text-ink"
      }`}
    >
      {l}
    </button>
  );

  return (
    <div className="flex items-center" role="group" aria-label="Språk / Language">
      {btn("sv")}
      <span aria-hidden className="text-neutral-300">/</span>
      {btn("en")}
    </div>
  );
}
