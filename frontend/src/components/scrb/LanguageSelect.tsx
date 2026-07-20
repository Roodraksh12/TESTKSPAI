"use client";

import { Select } from "./primitives";
import { LANGUAGES, type Language } from "@/lib/i18n";

interface LanguageSelectProps {
  value: Language;
  onChange: (value: Language) => void;
}

export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as Language)}
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
