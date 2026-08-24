import { useCallback, useRef, useState } from "react";
import { apiFetchResponse } from "@/api/client";

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
  const requestRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setSpeakingId(null);
  }, []);

  const speak = useCallback(async (id: string, text: string) => {
    stop();
    const clean = stripMarkdown(text).slice(0, 5000);
    if (!clean) return;

    const lang = KANNADA_RANGE.test(clean) ? "kn-IN" : "en-IN";
    const controller = new AbortController();
    requestRef.current = controller;
    setSpeakingId(id);

    try {
      const response = await apiFetchResponse(
        "/api/tts",
        {
          method: "POST",
          body: JSON.stringify({ text: clean, lang }),
          signal: controller.signal,
        },
      );
      if (requestRef.current !== controller) return;

      const objectUrl = URL.createObjectURL(await response.blob());
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audio.onended = stop;
      audio.onerror = stop;
      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      if (!controller.signal.aborted) console.error(error);
      if (requestRef.current === controller) stop();
    }
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
