"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translations, type Language } from "./translations";

const STORAGE_KEY = "scrb_lang";

type I18nValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  /** Translate a key. Falls back to English, then to the key itself. */
  t: (key: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLang(): Language {
  if (typeof window === "undefined") return "EN";
  return localStorage.getItem(STORAGE_KEY) === "KN" ? "KN" : "EN";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(readStoredLang);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    // Keep the document in sync so screen readers and the browser's own
    // spellcheck/translation heuristics get the right language.
    document.documentElement.lang = next === "KN" ? "kn" : "en";
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "KN" ? "kn" : "en";
  }, [lang]);

  // Falling back through English rather than rendering an empty string means a
  // key missing from the Kannada table degrades to readable English instead of
  // a blank label.
  const t = useCallback(
    (key: string) => translations[lang][key] ?? translations.EN[key] ?? key,
    [lang]
  );

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return ctx;
}

export type { Language };
export { LANGUAGES } from "./translations";
