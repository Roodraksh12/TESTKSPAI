import { useCallback, useRef, useState } from "react";

// Kannada Unicode block: auto-detect so replies in Kannada get a kn-IN voice
// without the officer having to toggle anything.
const KANNADA_RANGE = /[ಀ-೿]/;

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~]/g, " ")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  if (!isSpeechSupported()) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((v) => v.lang === lang);
  if (exact) return exact;
  const prefix = lang.split("-")[0];
  return voices.find((v) => v.lang.startsWith(prefix));
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Per-message play/stop toggle for TTS playback of assistant replies. */
export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (isSpeechSupported()) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  const speak = useCallback((id: string, text: string) => {
    if (!isSpeechSupported()) return;
    window.speechSynthesis.cancel();
    const clean = stripMarkdown(text);
    if (!clean) return;

    const lang = KANNADA_RANGE.test(clean) ? "kn-IN" : "en-IN";
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeakingId((current) => (current === id ? null : current));
    utterance.onerror = () => setSpeakingId((current) => (current === id ? null : current));
    utteranceRef.current = utterance;
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }, []);

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

  return { speakingId, speak, stop, toggle, isSupported: isSpeechSupported() };
}
