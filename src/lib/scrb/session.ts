import { useEffect, useState } from "react";

export type DemoSession = {
  badgeId: string;
  officerName: string;
  district: string;
  station: string;
  role: "Investigator" | "SHO" | "Supervisor";
  language: "EN" | "KN";
};

const KEY = "scrb-sahayak-session";

export function readSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoSession) : null;
  } catch {
    return null;
  }
}

export function writeSession(s: DemoSession) {
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
}

export function useDemoSession() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setSession(readSession());
    setHydrated(true);
  }, []);
  return {
    session,
    hydrated,
    setSession: (s: DemoSession | null) => {
      if (s) writeSession(s);
      else clearSession();
      setSession(s);
    },
  };
}

export const DEMO_CREDENTIALS: DemoSession = {
  badgeId: "KA-14827",
  officerName: "Insp. A. Rao",
  district: "Bengaluru City",
  station: "Cubbon Park",
  role: "Investigator",
  language: "EN",
};
