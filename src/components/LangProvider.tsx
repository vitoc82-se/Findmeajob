"use client";

import { createContext, useContext } from "react";
import { DICTS, type Dict, type Lang } from "@/lib/i18n";

const LangContext = createContext<Lang>("sv");

// The server layout resolves the language (cookie, default sv) and hands it down
// so client components render the same language on first paint — no flash.
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): Dict {
  return DICTS[useLang()];
}
