import { useCallback, useRef, useState } from "react";

// Kannada Unicode block: auto-detect so replies in Kannada get a kn-IN voice
// without the officer having to toggle anything.
const KANNADA_RANGE = /[ಀ-೿]/;

function stripMarkdown(text: string): string {
  let clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~]/g, " ")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  // Fix common police acronyms so the TTS spells them out instead of reading them as words
  // Note: Using spaces instead of periods so Azure TTS doesn't read the word "dot".
  clean = clean.replace(/\bFIR\b/gi, "F I R");
  clean = clean.replace(/\bCrPC\b/gi, "C R P C");
  clean = clean.replace(/\bBNS\b/gi, "B N S");
  clean = clean.replace(/\bBNSS\b/gi, "B N S S");
  clean = clean.replace(/\bSHO\b/gi, "S H O");
  clean = clean.replace(/\bSP\b/gi, "S P");

  clean = clean.replace(/\bMO\b/g, "M O"); // Case sensitive so it doesn't break words containing 'mo'

  return clean;
}

export function isSpeechSupported(): boolean {
  // Backend Edge-TTS endpoint is always available when the API is up.
  return true;
}

/** Per-message play/stop toggle for TTS playback of assistant replies. */
export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setSpeakingId(null);
  }, []);

  const speak = useCallback((id: string, text: string) => {
    stop();
    const clean = stripMarkdown(text);
    if (!clean) return;

    const lang = KANNADA_RANGE.test(clean) ? "kn-IN" : "en-IN";

    const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
    const audioUrl = `${API_BASE_URL}/api/tts?text=${encodeURIComponent(clean)}&lang=${lang}`;
    const audio = new Audio(audioUrl);

    audio.onended = () => setSpeakingId((current) => (current === id ? null : current));
    audio.onerror = () => setSpeakingId((current) => (current === id ? null : current));

    audioRef.current = audio;
    setSpeakingId(id);
    audio.play().catch(console.error);
  }, [stop]);

  const toggle = useCallback(
    (id: string, text: string) => {
      if (speakingId === id) {
        stop();
      } else {
        speak(id, text);
      }
    },
    [speakingId, speak, stop]
  );

  return { speakingId, speak, stop, toggle, isSupported: true };
}
