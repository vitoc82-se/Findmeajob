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
      className={`px-1.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
        lang === l ? "text-ink" : "text-neutral-400 hover:text-neutral-600"
      }`}
    >
      {l}
    </button>
  );

  return (
    <div className="flex items-center" aria-label="Language">
      {btn("sv")}
      <span className="text-neutral-300">/</span>
      {btn("en")}
    </div>
  );
}
