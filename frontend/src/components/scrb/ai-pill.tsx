"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Mic, Send, X, Loader2, ArrowUpRight, Copy, Edit2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiRequest } from "@/api/client";
import { usePageContext } from "@/lib/scrb/page-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const VoiceEqualizer = ({ isListening }: { isListening: boolean }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  
  useEffect(() => {
    if (!isListening) return;
    
    let audioContext: AudioContext;
    let analyzer: AnalyserNode;
    let stream: MediaStream;
    let animationFrame: number;
    
    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 64;
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyzer);
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        
        const update = () => {
          analyzer.getByteFrequencyData(dataArray);
          
          if (barsRef.current) {
            for (let i = 0; i < 5; i++) {
              const el = barsRef.current[i];
              if (el) {
                const value = dataArray[i * 3 + 2]; 
                const height = 4 + (value / 255) * 20;
                el.style.height = `${height}px`;
              }
            }
          }
          animationFrame = requestAnimationFrame(update);
        };
        update();
      } catch(e) {
        console.error("Audio API error:", e);
      }
    }
    
    init();
    
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioContext && audioContext.state !== "closed") audioContext.close();
    };
  }, [isListening]);

  return (
    <div className="flex items-center gap-[3px] h-6 items-end pb-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <div 
          key={i} 
          ref={el => { barsRef.current[i] = el; }}
          className="w-[3px] bg-teal rounded-full"
          style={{ height: '4px', transition: 'height 0.05s ease-out' }}
        />
      ))}
    </div>
  );
};

/**
 * Floating quick-ask pill.
 *
 * Answers in place using whatever page the officer is on, rather than handing
 * the question off to the Copilot tab — the point is to check something without
 * losing your place. Nothing here is written to conversation history; it's a
 * glance, not a thread. The query is still audit-logged server-side.
 */
export function AiPill() {
  const { t } = useI18n();
  const page = usePageContext();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const isTyping = input.trim().length > 0;

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Moving to another page invalidates the answer — it was about the old one.
  useEffect(() => {
    setAnswer(null);
    setSources([]);
    setError(null);
  }, [page.description]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typingElsewhere =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      // Shift+Space is free across the app; ⌘K already opens the command palette.
      if (e.code === "Space" && e.shiftKey && !typingElsewhere) {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [isOpen]);

  const toggleListen = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = document.documentElement.lang === "kn" ? "kn-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => setInput(event.results[0][0].transcript);
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const submit = async () => {
    if (!isTyping || loading) return;
    const question = input.trim();
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    try {
      const data = await apiRequest("/api/chat/quick", {
        method: "POST",
        body: JSON.stringify({
          message: question,
          pageContext: page.description,
          activeCaseId: page.activeCaseId,
        }),
      });
      setAnswer(data.reply || "No response.");
      setSources(data.sources || []);
    } catch (err: any) {
      setError(err?.message || "Couldn't reach the assistant.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setIsOpen(false);
    setInput("");
    setAnswer(null);
    setSources([]);
    setError(null);
  };

  return (
    // z-index sits above Leaflet, whose map controls and attribution declare up
    // to z-index 1000 and would otherwise draw through the panel on the Hotspots
    // and Analytics pages.
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[1100] flex justify-center px-4 sm:bottom-8">
      <motion.div
        ref={containerRef}
        layout
        transition={{ type: "spring", stiffness: 280, damping: 28, mass: 1 }}
        className={cn(
          "pointer-events-auto relative overflow-hidden rounded-[28px] border border-hairline",
          "bg-surface dark:bg-surface-2 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]"
        )}
        style={{ width: isOpen ? "min(640px, 92vw)" : "min(420px, 92vw)" }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {!isOpen ? (
            <motion.button
              key="collapsed"
              layout="position"
              type="button"
              onClick={() => setIsOpen(true)}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="relative flex w-full items-center gap-3 px-5 py-3 text-left"
            >
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal/25 to-amber/20 text-foreground">
                <Sparkles className="h-4 w-4" />
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full ring-2 ring-teal/30"
                  animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-muted-foreground">
                {page.placeholder}
              </span>
              <span className="text-mono hidden shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-1 text-[10px] text-muted-foreground sm:inline-flex">
                ⇧ Space
              </span>
            </motion.button>
          ) : (
            <motion.div
              key="expanded"
              layout
              initial={{ opacity: 0, scale: 0.98, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="relative flex flex-col gap-3 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-teal/25 to-amber/20">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <p className="text-[12px] font-medium tracking-wide text-foreground">
                  {t("copilot.title")}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("common.close")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Answer, shown in place rather than sending the officer elsewhere */}
              <AnimatePresence initial={false}>
                {(loading || answer || error) && (
                  <motion.div
                    key="answer"
                    layout="position"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="max-h-[40vh] overflow-y-auto rounded-2xl border border-hairline bg-surface-2 px-4 py-3"
                  >
                    {loading ? (
                      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("pill.thinking")}
                      </p>
                    ) : error ? (
                      <p className="text-[13px] text-danger">{error}</p>
                    ) : (
                      <>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer || ""}</ReactMarkdown>
                        </div>
                        {sources.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2">
                            <span className="text-[10px] text-muted-foreground">{t("pill.sources")}:</span>
                            {sources.map((s) => (
                              <span
                                key={s}
                                className="text-mono rounded-md bg-teal/10 px-1.5 py-0.5 text-[10px] text-teal"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-end gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(answer || ""); toast.success("Copied to clipboard"); }}
                            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy text"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.textarea
                layout="position"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={answer ? 2 : 3}
                placeholder={page.placeholder}
                className="w-full resize-none rounded-2xl border border-hairline bg-surface px-4 py-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
              />

              <motion.div layout="position" className="flex flex-wrap items-center gap-2">
                {!answer &&
                  page.prompts.slice(0, 3).map((prompt, i) => (
                    <motion.button
                      key={prompt}
                      type="button"
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * i, type: "spring", stiffness: 300, damping: 28 }}
                      onClick={() => setInput(prompt)}
                      className="rounded-full border border-hairline bg-surface px-3 py-1 text-[11px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                    >
                      {prompt}
                    </motion.button>
                  ))}

                {answer && (
                  <Link
                    to="/dashboard"
                    onClick={reset}
                    className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-3 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
                  >
                    {t("pill.continueInCopilot")} <ArrowUpRight className="h-3 w-3" />
                  </Link>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {listening && (
                    <div className="flex items-center gap-2 mr-2">
                      <span className="text-[12px] font-medium text-teal animate-pulse">
                        Listening...
                      </span>
                      <VoiceEqualizer isListening={listening} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={toggleListen}
                    aria-label="Voice input"
                    className={cn(
                      "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline transition",
                      listening
                        ? "bg-destructive/10 text-destructive"
                        : "bg-surface text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Mic className="h-4 w-4" />
                    {listening && (
                      <motion.span
                        className="absolute inset-0 rounded-full ring-2 ring-destructive/40"
                        animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      />
                    )}
                  </button>

                  <motion.button
                    type="button"
                    onClick={submit}
                    disabled={!isTyping || loading}
                    whileTap={{ scale: 0.96 }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition",
                      isTyping && !loading
                        ? "bg-ink text-white shadow-[0_8px_20px_-8px_rgba(15,23,42,0.45)] hover:brightness-110 dark:bg-foreground dark:text-background"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {t("pill.send")}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
