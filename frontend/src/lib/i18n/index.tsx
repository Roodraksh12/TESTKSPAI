"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState<Language | null>(null);

  const setLang = useCallback((next: Language) => {
    if (next === lang || isTranslating) return;
    
    setTargetLang(next);
    setIsTranslating(true);

    // Wait for the overlay to fully fade in (300ms)
    setTimeout(() => {
      setLangState(next);
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next === "KN" ? "kn" : "en";
      
      // Wait for React to render the new strings, then fade out the overlay
      setTimeout(() => {
        setIsTranslating(false);
      }, 500);
    }, 300);
  }, [lang, isTranslating]);

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

  return (
    <I18nContext.Provider value={value}>
      {children}
      
      <AnimatePresence>
        {isTranslating && (
          <motion.div
            key="translation-curtain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md"
          >
            <div className="flex flex-col items-center gap-6">
              {/* Spinning language icon or indicator */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="relative h-12 w-12 rounded-full border-2 border-amber/20"
              >
                <div className="absolute top-0 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber shadow-[0_0_10px_rgba(226,163,61,0.8)]" />
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="font-mono text-sm tracking-widest text-foreground"
              >
                {targetLang === "KN" ? "ಕನ್ನಡಕ್ಕೆ ಅನುವಾದಿಸಲಾಗುತ್ತಿದೆ..." : "Translating to English..."}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </I18nContext.Provider>
  );
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
