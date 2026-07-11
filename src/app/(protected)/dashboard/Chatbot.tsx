"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, Mic, Sparkles, ShieldCheck, ChevronDown } from "lucide-react";
import { SUGGESTIONS } from "@/lib/scrb/mock";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useCopilotStore } from "@/lib/store";

export function FullPageChatbot() {
  const { chatHistory, setChatHistory, pageContext } = useCopilotStore();
  
  const [messages, setMessages] = useState<{role: string, content: string}[]>(
    chatHistory && chatHistory.length > 0 
      ? chatHistory 
      : [{
          role: "assistant",
          content: "Namaskara, Inspector. I've reviewed 3 open cases assigned to Cubbon Park station this morning. Two share a suspect signature. Would you like me to draft a linkage brief, or start with FIR-2026-1042?",
        }]
  );
  
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

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
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [setInput]);

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
      } catch (err) {
        setIsListening(false);
      }
    }
  };

  const handleSend = async (customMessage?: string) => {
    const textToSend = customMessage || input;
    if (!textToSend?.trim() || isLoading) return;
    
    setInput("");
    const userMessage = textToSend.trim();
    
    // Optimistic update
    const updatedMessages = [...messages, { role: "user", content: userMessage }];
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
          history: messages.map(m => ({ role: m.role, content: m.content }))
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        const finalMessages = [...updatedMessages, { role: "assistant", content: data.reply }];
        setMessages(finalMessages);
        setChatHistory(finalMessages);
      } else {
        setMessages([...updatedMessages, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
      }
    } catch (error) {
      setMessages([...updatedMessages, { role: "assistant", content: "Network error." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8 w-full max-w-6xl mx-auto">
      {/* The Main Chat Card */}
      <div className="flex flex-col bg-white dark:bg-surface rounded-[24px] shadow-sm border border-hairline overflow-hidden flex-1 relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-hairline shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-[#EAF3F3] text-[#0D9488] flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Investigation Copilot</h2>
              <p className="text-[10px] font-semibold text-slate-500 tracking-widest uppercase mt-0.5">
                SOURCE-CITED • AUDIT-LOGGED • READ-ONLY BY DEFAULT
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EAF3F3] text-[#0D9488] text-[13px] font-medium border border-[#CCFBF1]">
            <ShieldCheck className="w-4 h-4" />
            Secure session
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 relative custom-scrollbar bg-[#F8FAFC] dark:bg-background pb-32">
          <div className="flex flex-col space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div className={cn("flex gap-3 max-w-[85%]", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                    
                    {/* Avatar */}
                    {msg.role === "assistant" && (
                      <div className="shrink-0 mt-1">
                        <div className="w-9 h-9 rounded-full bg-[#EAF3F3] text-[#0D9488] flex items-center justify-center border border-[#CCFBF1]">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex flex-col gap-2">
                      <div className={cn(
                        "p-4 text-[15px] leading-relaxed max-w-none border",
                        msg.role === "user" 
                          ? "bg-slate-900 text-white rounded-[24px] rounded-tr-sm border-transparent" 
                          : "bg-[#F1F5F9] dark:bg-surface border-slate-200 dark:border-hairline text-slate-800 dark:text-slate-200 rounded-[24px] rounded-tl-sm prose prose-sm"
                      )}>
                        {msg.role === "user" ? (
                          msg.content
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>

                      {/* Mock Badges for Assistant's first message */}
                      {msg.role === "assistant" && i === 0 && (
                        <div className="flex flex-wrap items-center gap-2 pl-2">
                          <span className="px-2.5 py-1 rounded-full bg-slate-200/70 text-slate-600 text-[11px] font-mono">Case Ledger</span>
                          <span className="px-2.5 py-1 rounded-full bg-slate-200/70 text-slate-600 text-[11px] font-mono">MO Cluster DB</span>
                          <span className="px-2.5 py-1 rounded-full bg-[#EAF3F3] text-[#0D9488] font-medium text-[11px]">92% confidence</span>
                          <button className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] flex items-center gap-1 hover:bg-slate-50 transition-colors">
                            Why <ChevronDown className="w-3 h-3" />
                          </button>
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
                    <div className="w-9 h-9 rounded-full bg-[#EAF3F3] text-[#0D9488] flex items-center justify-center border border-[#CCFBF1]">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="bg-[#F1F5F9] dark:bg-surface border border-slate-200 dark:border-hairline rounded-[24px] rounded-tl-sm p-4 flex items-center justify-center h-[52px]">
                    <div className="flex gap-1.5 items-center">
                      <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                      <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2, ease: "easeInOut" }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                      <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4, ease: "easeInOut" }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={endRef} className="h-4" />
          </div>
        </div>

        {/* Floating Input Area (Absolute positioned at the bottom of the card) */}
        <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC] to-transparent dark:from-background dark:via-background pointer-events-none" />
          
          <div className="relative z-10">
            {/* Suggestions */}
            {messages.length <= 1 && (
              <div className="flex flex-wrap gap-2 mb-4 justify-start">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => handleSend(s.text)}
                    className="rounded-full border border-slate-200 dark:border-hairline bg-white dark:bg-surface px-4 py-2 text-[13px] text-slate-600 dark:text-muted-foreground transition-all hover:bg-slate-50 dark:hover:bg-surface-2 shadow-sm"
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            )}

            {/* Input Box */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-3 bg-white dark:bg-surface-2 p-2 rounded-full border border-slate-200 dark:border-hairline transition-all duration-200 focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100 dark:focus-within:ring-surface-2 shadow-sm"
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
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:text-muted-foreground dark:hover:text-foreground h-11 w-11 flex items-center justify-center rounded-full transition-colors" 
              >
                <Paperclip className="w-5 h-5" />
              </button>
              
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about a FIR, entity, hotspot... / ಪ್ರಶ್ನೆ ಕೇಳಿ"
                className="flex-1 bg-transparent border-none shadow-none focus:outline-none text-[15px] text-slate-800 dark:text-foreground placeholder:text-slate-400 font-sans"
              />
              
              <div className="flex items-center gap-1.5 shrink-0 pr-1">
                <button 
                  type="button"
                  onClick={toggleListen}
                  className={cn(
                    "h-11 w-11 flex items-center justify-center rounded-full transition-colors",
                    isListening ? "text-teal-600 bg-teal-50" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <Mic className={cn("w-5 h-5", isListening && "animate-pulse")} />
                </button>
                <button 
                  type="submit"
                  disabled={isLoading || !input?.trim()}
                  className="bg-slate-900 dark:bg-white dark:text-slate-900 text-white px-5 py-2.5 h-11 flex items-center justify-center rounded-full font-medium text-[14px] disabled:opacity-50 transition-all hover:bg-slate-800 shadow-sm"
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
