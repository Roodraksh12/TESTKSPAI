"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, Mic, Sparkles, ShieldCheck, ClipboardList, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useCopilotStore, type ChatMessage } from "@/lib/store";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const DEFAULT_SUGGESTIONS = [
  "Brief me on open cases at my station",
  "What are the current hotspot alerts?",
  "Search vehicle theft cases under investigation",
];

export function FullPageChatbot() {
  const {
    chatHistory,
    setChatHistory,
    pageContext,
    activeCaseId,
    intakeActionPrompts,
    setActiveCaseId,
  } = useCopilotStore();

  const searchParams = useSearchParams();
  const isIntake = searchParams.get("intake") === "1";

  const [messages, setMessages] = useState<{ role: string; content: string; kind?: string }[]>(
    chatHistory && chatHistory.length > 0
      ? chatHistory
      : [
          {
            role: "assistant",
            content:
              "Namaskara. I am the **Investigation Copilot**.\n\nAfter you **upload and save an FIR**, I will automatically run an **intake brief**: identity leads, MO-similar cases, legal framing, 24h checklist, and draft notes.\n\nYou can also open any case dossier and ask me to *run intake on this case*.",
          },
        ]
  );

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Sync if store was seeded (e.g. right after FIR save)
  useEffect(() => {
    if (chatHistory && chatHistory.length > 0) {
      setMessages(chatHistory);
    }
  }, [chatHistory]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    ) {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) return;
      try {
        const lang = localStorage.getItem("scrb_lang") === "KN" ? "kn-IN" : "en-IN";
        recognitionRef.current.lang = lang;
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const handleSend = async (customMessage?: string) => {
    const textToSend = customMessage || input;
    if (!textToSend?.trim() || isLoading) return;

    setInput("");
    const userMessage = textToSend.trim();

    const updatedMessages = [...messages, { role: "user", content: userMessage }] as ChatMessage[];
    setMessages(updatedMessages);
    setChatHistory(updatedMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          pageContext: pageContext,
          activeCaseId: activeCaseId,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const finalMessages = [
          ...updatedMessages,
          { role: "assistant", content: data.reply },
        ] as ChatMessage[];
        setMessages(finalMessages);
        setChatHistory(finalMessages);
      } else {
        setMessages([
          ...updatedMessages,
          {
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          },
        ]);
      }
    } catch {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: "Network error." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const chips =
    intakeActionPrompts.length > 0
      ? intakeActionPrompts
      : activeCaseId
        ? [
            "Run full intake on this case",
            "Show MO-similar cases",
            "Give me the 24–72h checklist",
            "Draft SP progress note",
          ]
        : DEFAULT_SUGGESTIONS;

  const showChips = messages.length <= 2 || isIntake;

  return (
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8 w-full max-w-6xl mx-auto">
      <div className="flex flex-col bg-surface rounded-2xl shadow-sm border border-hairline overflow-hidden flex-1 relative">
        <div className="flex items-center justify-between p-5 border-b border-hairline shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-teal/10 text-teal flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-foreground">
                Investigation Copilot
              </h2>
              <p className="text-[10px] font-medium text-muted-foreground tracking-widest uppercase mt-0.5">
                Intake · Matches · Checklist · Drafts · Source-cited
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeCaseId && (
              <Link
                href={`/cases/${activeCaseId}`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber/10 text-amber text-[12px] font-medium border border-amber/20 hover:bg-amber/15"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Active case
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal/10 text-teal text-[13px] font-medium border border-teal/20">
              <ShieldCheck className="w-4 h-4" />
              Secure session
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 relative custom-scrollbar bg-background pb-40">
          <div className="flex flex-col space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex w-full",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "flex gap-3 max-w-[90%]",
                      msg.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="shrink-0 mt-1">
                        <div className="w-9 h-9 rounded-full bg-teal/10 text-teal flex items-center justify-center border border-teal/20">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 min-w-0">
                      <div
                        className={cn(
                          "p-4 text-[15px] leading-relaxed max-w-none border",
                          msg.role === "user"
                            ? "bg-ink text-white rounded-2xl rounded-tr-sm border-transparent"
                            : "bg-surface-2 border-hairline text-foreground rounded-2xl rounded-tl-sm prose prose-sm dark:prose-invert max-w-none"
                        )}
                      >
                        {msg.role === "user" ? (
                          msg.content
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>

                      {msg.role === "assistant" && (msg.kind === "intake" || (isIntake && i === 0)) && (
                        <div className="flex flex-wrap items-center gap-2 pl-2">
                          <span className="px-2.5 py-1 rounded-full bg-teal/10 text-teal text-[11px] font-medium">
                            Post-upload intake
                          </span>
                          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-mono">
                            Leads only · Confirm before filing
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start w-full"
              >
                <div className="flex gap-3 flex-row max-w-[85%]">
                  <div className="shrink-0 mt-1">
                    <div className="w-9 h-9 rounded-full bg-teal/10 text-teal flex items-center justify-center border border-teal/20">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="bg-surface-2 border border-hairline rounded-2xl rounded-tl-sm p-4 flex items-center justify-center h-[52px]">
                    <div className="flex gap-1.5 items-center">
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.5,
                          delay: 0.2,
                          ease: "easeInOut",
                        }}
                        className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.5,
                          delay: 0.4,
                          ease: "easeInOut",
                        }}
                        className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={endRef} className="h-4" />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background to-transparent pointer-events-none" />

          <div className="relative z-10">
            {showChips && (
              <div className="flex flex-wrap gap-2 mb-4 justify-start">
                {chips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSend(s)}
                    className="rounded-full border border-hairline bg-surface px-4 py-2 text-[13px] text-muted-foreground transition-all hover:bg-surface-2 shadow-sm text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-3 bg-surface p-2 rounded-full border border-hairline transition-all duration-200 focus-within:border-foreground/30 focus-within:ring-4 focus-within:ring-muted shadow-sm"
            >
              <input
                type="file"
                id="scrb-file-upload"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setInput(
                      (prev) =>
                        (prev ? prev + " " : "") + `[Attached: ${e.target.files![0].name}] `
                    );
                  }
                }}
              />
              <button
                type="button"
                onClick={() => document.getElementById("scrb-file-upload")?.click()}
                className="shrink-0 text-muted-foreground hover:text-foreground h-11 w-11 flex items-center justify-center rounded-full transition-colors"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  activeCaseId
                    ? "Ask about this case: checklist, matches, draft note…"
                    : "Ask about a FIR, intake, matches, hotspots… / ಪ್ರಶ್ನೆ ಕೇಳಿ"
                }
                className="flex-1 bg-transparent border-none shadow-none focus:outline-none text-[15px] text-foreground placeholder:text-muted-foreground font-sans"
              />

              <div className="flex items-center gap-1.5 shrink-0 pr-1">
                <button
                  type="button"
                  onClick={toggleListen}
                  className={cn(
                    "h-11 w-11 flex items-center justify-center rounded-full transition-colors",
                    isListening ? "text-teal bg-teal/10" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Mic className={cn("w-5 h-5", isListening && "animate-pulse")} />
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !input?.trim()}
                  className="bg-ink text-white dark:bg-foreground dark:text-background px-5 py-2.5 h-11 flex items-center justify-center rounded-full font-medium text-[14px] disabled:opacity-50 transition-all hover:bg-ink-2 shadow-sm"
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  Send
                </button>
              </div>
            </form>

            {activeCaseId && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Working on case{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setActiveCaseId(null)}
                >
                  clear focus
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
