"use client";

import { useState, useRef, useEffect } from "react"
import { Send, Mic, Paperclip, Bot, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function Chatbot({ officerId, stationId }: { officerId: string, stationId: string }) {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: "assistant", content: "Hello Officer. I am **SCRB Sahayak**. How can I assist you with investigations in your jurisdiction today?" }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", content: userMessage }])
    setIsLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage, 
          stationId,
          history: messages.map(m => ({ role: m.role, content: m.content }))
        })
      })
      
      const data = await res.json()
      if (res.ok) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }])
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }])
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: "assistant", content: "Network error." }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent relative overflow-hidden">
      {/* Minimal Header */}
      <div className="p-6 border-b border-[var(--border-light)] flex items-center gap-4 z-10 shrink-0 bg-[var(--canvas)]">
        <div className="w-10 h-10 rounded-[8px] bg-[var(--primary)] flex items-center justify-center text-[var(--on-primary)]">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-sans font-medium text-[18px] text-[var(--ink)] leading-tight tracking-tight">SCRB Copilot</h2>
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted)] font-medium mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--deep-green)]" /> Always-on Assistant
          </div>
        </div>
      </div>
      
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative z-0 pb-32">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, type: "spring", bounce: 0.4 }}
              className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                
                {/* Avatar */}
                <div className="shrink-0 mt-auto mb-1">
                  {msg.role === "user" ? (
                    <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-[var(--on-primary)]">
                      <User className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-[8px] bg-[var(--soft-stone)] flex items-center justify-center text-[var(--ink)]">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                </div>

                {/* Bubble */}
                <div className={`p-4 text-[16px] leading-[1.5] max-w-none ${
                  msg.role === "user" 
                    ? "bg-[var(--primary)] text-[var(--on-primary)] rounded-[22px] rounded-br-[4px] font-medium whitespace-pre-wrap" 
                    : "bg-[var(--soft-stone)] text-[var(--ink)] rounded-[22px] rounded-bl-[4px] prose prose-sm"
                }`}>
                  {msg.role === "user" ? (
                    msg.content
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
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
              <div className="shrink-0 mt-auto mb-1">
                <div className="w-8 h-8 rounded-[8px] bg-[var(--soft-stone)] flex items-center justify-center text-[var(--ink)]">
                  <Bot className="w-4 h-4" />
                </div>
              </div>
              <div className="bg-[var(--soft-stone)] rounded-[22px] rounded-bl-[4px] p-5 flex items-center justify-center h-12">
                <div className="flex gap-1.5 items-center">
                  <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }} className="w-1.5 h-1.5 bg-[var(--muted)] rounded-full" />
                  <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2, ease: "easeInOut" }} className="w-1.5 h-1.5 bg-[var(--muted)] rounded-full" />
                  <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4, ease: "easeInOut" }} className="w-1.5 h-1.5 bg-[var(--muted)] rounded-full" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Floating Input Area */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-[var(--canvas)] border-t border-[var(--border-light)]">
        <div className="max-w-3xl mx-auto">
          <motion.div 
            whileFocus="focused"
            initial="idle"
            variants={{
              idle: { boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)", scale: 1 },
              focused: { boxShadow: "0 0 0 2px var(--canvas), 0 0 0 4px var(--primary)", scale: 1.01 }
            }}
            transition={{ duration: 0.2 }}
            className="flex items-end gap-2 bg-[var(--canvas)] p-2 rounded-[22px] border border-[var(--card-border)] focus-within:border-[var(--primary)] transition-colors duration-200"
          >
            <Button variant="ghost" size="icon" className="shrink-0 text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--soft-stone)] rounded-[16px] h-12 w-12">
              <Paperclip className="w-5 h-5" />
            </Button>
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message Copilot..."
              className="flex-1 bg-transparent border-none shadow-none focus:outline-none resize-none py-3.5 px-2 max-h-32 min-h-[52px] text-[16px] text-[var(--ink)] placeholder:text-[var(--muted)] font-sans"
              rows={1}
            />
            
            <div className="flex items-center gap-1 shrink-0 pb-1 pr-1">
              <Button variant="ghost" size="icon" className="text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--soft-stone)] rounded-[16px] h-10 w-10">
                <Mic className="w-5 h-5" />
              </Button>
              <Button 
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="btn-primary w-10 h-10 p-0 flex items-center justify-center rounded-full"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
