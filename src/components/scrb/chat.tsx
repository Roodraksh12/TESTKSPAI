"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, Mic, Sparkles, ChevronDown, ShieldCheck } from "lucide-react";
import { GlassButton, GlassPill, IconOrb } from "./primitives";
import { SEED_MESSAGES, SUGGESTIONS, type ChatMessage } from "@/lib/scrb/mock";
import { cn } from "@/lib/utils";

function craftReply(prompt: string): ChatMessage {
  const p = prompt.toLowerCase();
  if (p.includes("link") || p.includes("network"))
    return {
      id: crypto.randomUUID(),
      role: "ai",
      text: "Cross-referencing FIR-2026-1042 and FIR-2026-1039: both cases share partial plate KA-05-MJ and a common suspect pseudonym ('Chotu'). Recommend a joint interview and CCTV correlation between Trinity Circle (14 Jun, 21:04) and HAL 2nd Stage (11 Jun, 22:41).",
      sources: [
        { label: "FIR-2026-1042", ref: "c-1042" },
        { label: "FIR-2026-1039", ref: "c-1039" },
        { label: "CCTV Index", ref: "cctv-mg-hal" },
      ],
      confidence: 88,
      reasoning:
        "Vehicle partial-plate match at 0.92 confidence; suspect alias appears in both witness statements; temporal proximity within 72h across adjacent beats.",
    };
  if (p.includes("hotspot") || p.includes("theft"))
    return {
      id: crypto.randomUUID(),
      role: "ai",
      text: "Vehicle-theft hotspots in Bengaluru East (Q2): Whitefield Depot (12 incidents, ↓3), HAL 2nd Stage (27, ↑9). Recommend increased night patrols along Old Airport Road between 22:00–02:00.",
      sources: [
        { label: "Hotspots", ref: "hotspots-q2" },
        { label: "Beat Patrol Log", ref: "patrol-2026" },
      ],
      confidence: 84,
      reasoning:
        "Incident density normalised per km²; overlay with patrol coverage identifies coverage gap on Old Airport Rd between 22:00–02:00.",
    };
  if (p.includes("summarise") || p.includes("summary") || p.includes("fir-2026-1021"))
    return {
      id: crypto.randomUUID(),
      role: "ai",
      text: "FIR-2026-1021 (Cheque fraud, Jayanagar): 4 cheques totalling ₹18.6L endorsed with forged signatures. Two beneficiary accounts (HDFC-••4491, ICICI-••7712) flagged by RBI CFR. Suggested next steps: freeze accounts under Sec. 102 CrPC and issue notices to signatories.",
      sources: [
        { label: "FIR-2026-1021", ref: "c-1021" },
        { label: "RBI CFR List", ref: "rbi-cfr-2026" },
      ],
      confidence: 91,
      reasoning: "Extracted entities validated against RBI CFR reference dataset with exact-account match.",
    };
  return {
    id: crypto.randomUUID(),
    role: "ai",
    text: "Searched 3 case ledgers and 2 MO clusters. I don't have a confident match for that query yet — try referencing a FIR number, entity, or district, and I'll cite the exact record.",
    sources: [{ label: "Case Ledger", ref: "all" }],
    confidence: 42,
    reasoning: "No direct entity or FIR match found; confidence below 0.5 threshold.",
  };
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("scrb_chat_context");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return SEED_MESSAGES;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("scrb_chat_context", JSON.stringify(messages));
    }
  }, [messages]);

  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
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
      if (!recognitionRef.current) {
        alert("Speech recognition is not supported in this browser.");
        return;
      }
      try {
        const lang = localStorage.getItem("scrb_lang") === "KN" ? "kn-IN" : "en-IN";
        recognitionRef.current.lang = lang;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error("Speech error", err);
        alert("Could not start microphone. Please check browser permissions.");
        setIsListening(false);
      }
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || thinking) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setThinking(true);

    try {
      const lang = localStorage.getItem("scrb_lang") || "EN";
      const finalPrompt = lang === "KN" ? text + " (Please reply in Kannada)" : text;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: finalPrompt }),
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "ai",
        text: data.reply,
      };
      setMessages((m) => [...m, aiMsg]);
    } catch (e) {
      console.error(e);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "ai", text: "Sorry, there was an error processing your request. Please check your API Key or try again." },
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="glass flex h-[calc(100vh-13rem)] min-h-[560px] flex-col overflow-hidden rounded-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-hairline px-6 py-4">
        <IconOrb tone="teal">
          <Sparkles className="h-4 w-4" />
        </IconOrb>
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight">Investigation Copilot</p>
          <p className="text-[10px] tracking-widest text-muted-foreground uppercase">
            Source-cited · Audit-logged · Read-only by default
          </p>
        </div>
        <GlassPill tone="teal" className="ml-auto">
          <ShieldCheck className="h-3 w-3" /> Secure session
        </GlassPill>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
        {thinking && <TypingShimmer />}
        <div ref={endRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-6 pb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.text}
              onClick={() => send(s.text)}
              className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs text-muted-foreground transition hover:-translate-y-0.5 hover:border-foreground/30 hover:text-foreground"
            >
              {s.text}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-hairline p-4 bg-white rounded-b-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-full border border-hairline bg-surface-2 px-3 py-2 shadow-sm transition-colors focus-within:border-foreground/20"
        >
          <input 
            type="file" 
            id="scrb-file-upload" 
            className="hidden" 
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                setInput((prev) => (prev ? prev + " " : "") + `[Attached: ${e.target.files[0].name}] `);
              }
            }}
          />
          <button 
            type="button" 
            onClick={() => document.getElementById("scrb-file-upload")?.click()}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" 
            aria-label="Attach"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a FIR, entity, hotspot, or ‘link cases…’"
            className="flex-1 bg-transparent px-2 py-2 text-[13px] placeholder:text-muted-foreground focus:outline-none"
          />
          <button 
            type="button" 
            onClick={toggleListen}
            className={cn("rounded-full p-2 transition-colors", isListening ? "bg-amber-500 text-white hover:bg-amber-600" : "text-muted-foreground hover:bg-muted hover:text-foreground")} 
            aria-label="Voice"
          >
            <Mic className={cn("h-4 w-4", isListening && "animate-pulse")} />
          </button>
          <GlassButton variant="primary" size="sm" type="submit" className="!rounded-full !h-8 !w-8 !p-0">
            <Send className="h-4 w-4 ml-0.5" />
          </GlassButton>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: ChatMessage }) {
  const [showWhy, setShowWhy] = useState(false);
  const isAI = m.role === "ai";
  return (
    <div className={cn("flex gap-3", isAI ? "justify-start" : "justify-end")}>
      {isAI && (
        <IconOrb tone="teal" size="sm" className="mt-1">
          <Sparkles className="h-3.5 w-3.5" />
        </IconOrb>
      )}
      <div className={cn("max-w-[78%]", !isAI && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-3xl px-4 py-3 text-sm leading-relaxed",
            isAI ? "glass-teal" : "glass-ink",
          )}
        >
          {m.text}
        </div>
        {isAI && (m.sources || m.confidence != null) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {m.sources?.map((s) => (
              <GlassPill key={s.ref} tone="muted">
                <span className="text-mono">{s.label}</span>
              </GlassPill>
            ))}
            {m.confidence != null && (
              <GlassPill tone={m.confidence >= 80 ? "teal" : m.confidence >= 60 ? "amber" : "danger"}>
                {m.confidence}% confidence
              </GlassPill>
            )}
            {m.reasoning && (
              <button
                onClick={() => setShowWhy((v) => !v)}
                className="glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-foreground hover:text-foreground"
              >
                Why <ChevronDown className={cn("h-3 w-3 transition", showWhy && "rotate-180")} />
              </button>
            )}
          </div>
        )}
        {isAI && showWhy && m.reasoning && (
          <div className="glass mt-2 rounded-2xl p-3 text-xs leading-relaxed text-muted-foreground">
            {m.reasoning}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingShimmer() {
  return (
    <div className="flex items-center gap-3">
      <IconOrb tone="teal" size="sm">
        <Sparkles className="h-3.5 w-3.5" />
      </IconOrb>
      <div className="glass-teal rounded-3xl px-4 py-3">
        <span className="animate-pulse text-sm text-muted-foreground">
          Checking police records…
        </span>
      </div>
    </div>
  );
}
