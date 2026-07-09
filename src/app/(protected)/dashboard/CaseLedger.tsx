"use client";

import { useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Filter, AlertCircle, Clock, CheckCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const statusColors = {
  OPEN: "text-[var(--error)]",
  UNDER_INVESTIGATION: "text-[var(--focus-blue)]",
  CHARGESHEETED: "text-[var(--deep-green)]",
  CLOSED: "text-[var(--deep-green)]",
}

export function CaseLedger({ cases }: { cases: any[] }) {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredCases = cases.filter(c => 
    c.firNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.crimeType.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full bg-transparent z-10 relative">
      <div className="p-8 border-b border-[var(--border-light)] shrink-0">
        <h2 className="font-sans font-medium text-[24px] tracking-tight text-[var(--ink)] mb-6 flex items-center justify-between">
          Station Ledger
          <span className="font-mono text-[14px] text-[var(--muted)]">
            {filteredCases.length} CASES
          </span>
        </h2>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <Input 
              placeholder="Search FIR..." 
              className="pl-10 bg-[var(--canvas)] border-[var(--border-light)] text-[var(--ink)] placeholder:text-[var(--muted)] focus-visible:ring-0 focus-visible:border-[var(--primary)] shadow-none rounded-[4px] h-11 text-[16px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" className="h-11 w-11 shadow-none border-[var(--border-light)] bg-transparent text-[var(--ink)] hover:bg-[var(--soft-stone)] rounded-[4px]">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <motion.div 
          className="space-y-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
          }}
        >
          <AnimatePresence>
            {filteredCases.map((c) => (
              <motion.div 
                key={c.id}
                variants={{
                  hidden: { opacity: 0, y: 15, scale: 0.98 },
                  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
                }}
                whileHover={{ scale: 1.01, translateY: -2 }}
                layout
              >
              <Link href={`/cases/${c.id}`}>
                <div className="p-6 rounded-[8px] bg-[var(--canvas)] border border-[var(--card-border)] hover:border-[var(--border-light)] hover:bg-[var(--soft-stone)] transition-colors duration-200 cursor-pointer group relative overflow-hidden">
                  
                  <div className="flex justify-between items-start mb-4">
                    <span className="font-mono text-[14px] font-medium text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors tracking-wide">
                      {c.firNumber}
                    </span>
                    <span className={`text-[12px] font-medium flex items-center gap-1.5 uppercase ${statusColors[c.status as keyof typeof statusColors]}`}>
                      {c.status.replace("_", " ")}
                    </span>
                  </div>
                  
                  <div>
                    <p className="text-[18px] font-medium text-[var(--ink)] mb-2 leading-snug">{c.crimeType}</p>
                    <p className="text-[14px] text-[var(--slate)] line-clamp-2 leading-relaxed">{c.summary}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[var(--border-light)] flex justify-between items-center text-[12px] font-medium text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(c.reportedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {c.casePersons.length > 0 && (
                      <span className="font-mono tracking-wide">
                        {c.casePersons.length} SUSPECTS
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              </motion.div>
            ))}
          </AnimatePresence>
          {filteredCases.length === 0 && (
            <div className="p-8 text-center text-[var(--muted)] text-[16px] bg-[var(--canvas)] border border-[var(--border-light)] rounded-[8px]">
              No cases match your search.
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
