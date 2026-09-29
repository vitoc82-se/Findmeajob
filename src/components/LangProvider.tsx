"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DICTS, LANG_COOKIE, DEFAULT_LANG, type Dict, type Lang } from "@/lib/i18n";

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangState>({ lang: DEFAULT_LANG, setLang: () => {} });

// The public pages are pre-rendered (static, served from the CDN), so the server
// can't read a cookie per visitor. Everything renders in Swedish, the default; a
// visitor who picked English gets it on the first client render via the cookie.
// The choice is a first-party, strictly functional cookie.
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=(sv|en)`));
    if (m && m[1] !== DEFAULT_LANG) setLangState(m[1] as Lang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setLangState(next);
  }, []);

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext).lang;
}

export function useSetLang(): (l: Lang) => void {
  return useContext(LangContext).setLang;
}

export function useT(): Dict {
  return DICTS[useLang()];
}
