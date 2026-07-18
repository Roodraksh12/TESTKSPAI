"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Mic, Sparkles, ShieldCheck, ClipboardList, ExternalLink, TrendingUp, AlertTriangle, Activity, Briefcase, ChevronRight, FileText, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useCopilotStore, type ChatMessage } from "@/lib/store";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { Badge, IconOrb, StatCard } from "@/components/scrb/primitives";

const DEFAULT_SUGGESTIONS = [
  "Brief me on open cases at my station",
  "What are the current hotspot alerts?",
  "Search vehicle theft cases under investigation",
];

const STATUS_COLORS: Record<string, string> = {
  OPEN: "text-teal",
  UNDER_INVESTIGATION: "text-amber",
  CHARGESHEETED: "text-muted-foreground",
  CLOSED: "text-muted-foreground",
};

export function DashboardClient({
  totalCases,
  clearanceRate = 0,
  alertCount,
  recentCases,
  statsLoading = false,
}: {
  totalCases: number;
  clearanceRate?: number;
  alertCount: number;
  recentCases: { id: string; firNumber: string; crimeType: string; status: string; reportedDate: string }[];
  statsLoading?: boolean;
}) {
  const {
    chatHistory,
    setChatHistory,
    pageContext,
    activeCaseId,
    intakeActionPrompts,
    setActiveCaseId,
  } = useCopilotStore();

  const [searchParams] = useSearchParams();
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
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onresult = (event: any) => { setInput(event.results[0][0].transcript); };
      recognitionRef.current.onerror = () => { setIsListening(false); };
      recognitionRef.current.onend = () => { setIsListening(false); };
    }
  }, []);

  const toggleListen = () => {
    if (isListening) { recognitionRef.current?.stop(); return; }
    if (!recognitionRef.current) return;
    try {
      const lang = localStorage.getItem("scrb_lang") === "KN" ? "kn-IN" : "en-IN";
      recognitionRef.current.lang = lang;
      recognitionRef.current.start();
      setIsListening(true);
    } catch { setIsListening(false); }
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
      const data = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: userMessage, pageContext, activeCaseId, history: messages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const finalMessages = [...updatedMessages, { role: "assistant", content: data.reply }] as ChatMessage[];
      setMessages(finalMessages);
      setChatHistory(finalMessages);
    } catch {
      setMessages([...updatedMessages, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    } finally { setIsLoading(false); }
  };

  const chips = intakeActionPrompts.length > 0
    ? intakeActionPrompts
    : activeCaseId
      ? ["Run full intake on this case", "Show MO-similar cases", "Give me the 24–72h checklist", "Draft SP progress note"]
      : DEFAULT_SUGGESTIONS;

  const showChips = messages.length <= 2 || isIntake;

  const hasHighAlerts = alertCount > 0;

  return (
    <div className="flex h-full gap-5">
      {/* Main: Chatbot Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Alert banner */}
        {hasHighAlerts && (
          <Link
            to="/hotspots"
            className="flex items-center gap-2 mb-4 rounded-2xl border border-amber/20 bg-amber/[0.08] px-4 py-2.5 text-sm text-amber hover:bg-amber/[0.12] transition-colors"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{alertCount} high-risk alert{alertCount > 1 ? "s" : ""} active in your jurisdiction</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          </Link>
        )}

        {/* Chat card */}
        <div className="flex flex-col bg-surface rounded-2xl shadow-sm border border-hairline overflow-hidden flex-1 relative">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/10 text-teal">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">Investigation Copilot</h2>
                <p className="text-[9px] font-medium text-muted-foreground tracking-[0.15em] uppercase">
                  Intake · Matches · Checklist · Drafts
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeCaseId && (
                <Link
                  to={`/cases/${activeCaseId}`}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-amber/10 px-3 py-1.5 text-[11px] font-medium text-amber border border-amber/15 hover:bg-amber/15"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Active case
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
              <div className="hidden sm:flex items-center gap-1.5 rounded-xl bg-teal/10 px-3 py-1.5 text-[11px] font-medium text-teal border border-teal/15">
                <ShieldCheck className="h-3.5 w-3.5" />
                Encrypted
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 bg-background pb-36">
            <div className="flex flex-col space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div className={cn("flex gap-3 max-w-[88%]", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                      {msg.role === "assistant" && (
                        <div className="shrink-0 mt-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal/10 text-teal border border-teal/15">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className={cn(
                          "px-4 py-3 text-sm leading-relaxed max-w-none border",
                          msg.role === "user"
                            ? "bg-ink text-white rounded-2xl rounded-tr-sm border-transparent"
                            : "bg-surface-2 border-hairline text-foreground rounded-2xl rounded-tl-sm prose prose-sm dark:prose-invert max-w-none"
                        )}>
                          {msg.role === "user" ? msg.content : <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>}
                        </div>
                        {msg.role === "assistant" && (msg.kind === "intake" || (isIntake && i === 0)) && (
                          <div className="flex flex-wrap items-center gap-2 px-1">
                            <span className="px-2 py-0.5 rounded-md bg-teal/10 text-teal text-[10px] font-medium">Post-upload intake</span>
                            <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-mono">Leads only · Confirm before filing</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isLoading && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                  <div className="flex gap-3 max-w-[85%]">
                    <div className="shrink-0 mt-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal/10 text-teal border border-teal/15">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="bg-surface-2 border border-hairline rounded-2xl rounded-tl-sm px-4 py-3 flex items-center">
                      <div className="flex gap-1.5 items-center">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ y: [0, -4, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2, ease: "easeInOut" }}
                            className="h-1.5 w-1.5 bg-muted-foreground rounded-full"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          {/* Input */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background to-transparent pointer-events-none" />
            <div className="relative z-10">
              {showChips && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {chips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSend(s)}
                      className="rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-[12px] text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground shadow-sm"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex items-center gap-2 bg-surface p-1.5 rounded-2xl border border-hairline transition-all duration-200 focus-within:border-foreground/30 focus-within:ring-4 focus-within:ring-muted shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => document.getElementById("scrb-file-upload")?.click()}
                  className="shrink-0 text-muted-foreground hover:text-foreground h-10 w-10 flex items-center justify-center rounded-xl transition-colors"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input type="file" id="scrb-file-upload" className="hidden"
                  onChange={(e) => { const files = e.target.files; if (files?.[0]) setInput((prev) => (prev ? prev + " " : "") + `[Attached: ${files[0].name}] `); }}
                />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={activeCaseId ? "Ask about this case..." : "Ask about a FIR, intake, matches, hotspots…"}
                  className="flex-1 bg-transparent border-none shadow-none focus:outline-none text-sm text-foreground placeholder:text-muted-foreground"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={toggleListen}
                    className={cn("h-10 w-10 flex items-center justify-center rounded-xl transition-colors", isListening ? "text-teal bg-teal/10" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Mic className={cn("h-4 w-4", isListening && "animate-pulse")} />
                  </button>
                  <button type="submit" disabled={isLoading || !input?.trim()}
                    className="bg-ink text-white dark:bg-foreground dark:text-background h-10 w-10 flex items-center justify-center rounded-xl disabled:opacity-40 transition-all hover:bg-ink-2 shadow-sm"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Dashboard Panel */}
      <div className="hidden xl:flex flex-col w-72 shrink-0 gap-4 overflow-y-auto">
        {/* Stats — filled async; chat shell never waits */}
        <div className="space-y-3">
          <StatCard
            icon={Briefcase}
            label="Total Cases"
            value={statsLoading ? "—" : totalCases}
            tone="teal"
          />
          <StatCard
            icon={TrendingUp}
            label="Clearance Rate"
            value={statsLoading ? "—" : `${clearanceRate}%`}
            tone="default"
          />
          <StatCard
            icon={AlertTriangle}
            label="High-Risk Alerts"
            value={statsLoading ? "—" : alertCount}
            tone={!statsLoading && alertCount > 0 ? "amber" : "default"}
          />
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Recent Cases</h3>
            <Link to="/cases" className="text-[10px] text-teal hover:text-teal/80 font-medium">View all</Link>
          </div>
          <div className="space-y-2">
            {statsLoading && recentCases.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />
              ))
            ) : recentCases.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No recent cases</p>
            ) : null}
            {recentCases.map((c) => (
              <Link key={c.id} to={`/cases/${c.id}`}
                className="flex items-start gap-2.5 rounded-xl p-2.5 hover:bg-surface-2 transition-colors group"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-foreground truncate group-hover:text-ink transition-colors">{c.firNumber}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground truncate">{c.crimeType}</span>
                    <span className={cn("text-[9px] font-medium", STATUS_COLORS[c.status] || "text-muted-foreground")}>
                      {c.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase mb-3">Quick Actions</h3>
          <div className="space-y-1.5">
            <Link to="/fir/upload"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-surface-2 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
                <FileText className="h-3.5 w-3.5" />
              </div>
              <span className="text-[12px] font-medium">New FIR Intake</span>
            </Link>
            <Link to="/hotspots"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-surface-2 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/10 text-teal">
                <MapPin className="h-3.5 w-3.5" />
              </div>
              <span className="text-[12px] font-medium">View Hotspots</span>
            </Link>
            <Link to="/network"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-surface-2 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <span className="text-[12px] font-medium">Entity Network</span>
            </Link>
          </div>
        </div>

        {/* Badge info */}
        <div className="rounded-2xl border border-hairline bg-surface p-4 text-center">
          <p className="text-[9px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Secured Session</p>
          <p className="mt-1 text-[10px] text-muted-foreground">256-bit encrypted · Audit logged</p>
        </div>
      </div>
    </div>
  );
}
