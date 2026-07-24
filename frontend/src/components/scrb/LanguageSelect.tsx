"use client";

import { Select } from "./primitives";
import { useI18n, LANGUAGES, type Language } from "@/lib/i18n";

export function LanguageSelect() {
  const { lang, setLang } = useI18n();

  // Applies immediately — no Apply button and no page reload, because the
  // language lives in React context rather than a cookie a reload has to pick up.
  return (
    <Select
      value={lang}
      onChange={(e) => setLang(e.target.value as Language)}
      aria-label="Interface language"
    >
      {LANGUAGES.map((option) => (
        <option key={option.value} value={option.value} className="bg-surface text-foreground">
          {option.label}
        </option>
      ))}
    </Select>
  );
}
