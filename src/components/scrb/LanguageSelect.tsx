"use client";

import { useEffect, useState } from "react";
import { Select, Button } from "./primitives";

export function LanguageSelect() {
  const [lang, setLang] = useState("EN");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem("scrb_lang") || "EN";
    setLang(savedLang);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLang(e.target.value);
    setHasChanges(true);
  };

  const applyLanguage = () => {
    localStorage.setItem("scrb_lang", lang);
    if (lang === "KN") {
      document.cookie = "googtrans=/en/kn; path=/";
    } else {
      document.cookie = "googtrans=/en/en; path=/";
      // Also clear it to be safe
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-3">
      <Select value={lang} onChange={handleChange} className="flex-1">
        <option value="EN" className="bg-surface text-foreground">English</option>
        <option value="KN" className="bg-surface text-foreground">ಕನ್ನಡ · Kannada</option>
      </Select>
      {hasChanges && (
        <Button variant="primary" onClick={applyLanguage}>
          Apply
        </Button>
      )}
    </div>
  );
}
