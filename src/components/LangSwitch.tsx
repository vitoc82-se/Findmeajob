"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import { useLang } from "./LangProvider";

// SV | EN toggle. Stores the choice in a first-party cookie (needed by the server
// to render the right language, so it's strictly functional) and refreshes.
export default function LangSwitch() {
  const lang = useLang();
  const router = useRouter();

  function set(next: Lang) {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  const btn = (l: Lang) => (
    <button
      onClick={() => set(l)}
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
