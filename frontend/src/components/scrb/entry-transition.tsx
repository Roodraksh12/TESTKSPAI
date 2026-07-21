"use client";

import { useEffect, useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KarnatakaSeal, TricolourThread } from "@/components/scrb/insignia";

const CLEARANCE_LINES = [
  "INITIATING BIOMETRIC SCAN...",
  "CONNECTING TO SECURE SCRB MAINFRAME...",
  "HANDSHAKE ESTABLISHED.",
  "VERIFYING FINGERPRINT MINUTIAE...",
  "CROSS-REFERENCING STATE DATABASE...",
  "MATCH FOUND.",
  "CLEARANCE GRANTED."
];

const RIDGES = Array.from({ length: 11 });
const MINUTIAE = [
  { x: 50, y: -40 },
  { x: -30, y: 60 },
  { x: 20, y: 80 },
  { x: -60, y: -20 },
  { x: 70, y: 20 },
  { x: 0, y: -80 },
  { x: -40, y: 20 },
  { x: 45, y: 40 },
];

const DISTRICT_PINGS = [
  { x: 200, y: 150, delay: 0, label: "BENGALURU" },
  { x: 150, y: 220, delay: 0.4, label: "MYSURU" },
  { x: 100, y: 180, delay: 0.8, label: "MANGALURU" },
  { x: 140, y: 80, delay: 1.2, label: "HUBBALLI" },
  { x: 230, y: 90, delay: 1.6, label: "KALABURAGI" },
];

const NETWORK_LINES = [
  { p1: 0, p2: 1 },
  { p1: 0, p2: 3 },
  { p1: 0, p2: 4 },
  { p1: 1, p2: 2 },
];

const generateHexRow = () => 
  Array.from({ length: 8 }, () => Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')).join(' ');

// Ultra-fast state component
const HexStream = memo(function HexStream() {
  const [hexData, setHexData] = useState<string[]>(Array(10).fill(''));
  useEffect(() => {
    const interval = setInterval(() => {
      setHexData(prev => [generateHexRow(), ...prev.slice(0, 9)]);
    }, 100);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="absolute top-1/4 left-0 text-[8px] text-[#4fd1c5]/10 leading-tight select-none">
      {hexData.map((row, i) => (
        <div key={i}>{row}</div>
      ))}
    </div>
  );
});

export function EntryTransition({ show }: { show: boolean }) {
  const [line, setLine] = useState(-1);
  const [scanned, setScanned] = useState(false);
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    if (!show) {
      setLine(-1);
      setScanned(false);
      setMatched(false);
      return;
    }

    let l = 0;
    const interval = setInterval(() => {
      setLine(l);
      if (l < CLEARANCE_LINES.length) l++;
      if (l >= CLEARANCE_LINES.length) clearInterval(interval);
    }, 300);

    const scanTimeout = setTimeout(() => setScanned(true), 1400);
    const matchTimeout = setTimeout(() => setMatched(true), 2200);

    return () => {
      clearInterval(interval);
      clearTimeout(scanTimeout);
      clearTimeout(matchTimeout);
    };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] bg-background text-foreground flex items-center justify-center overflow-hidden font-mono"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ clipPath: "circle(0% at 50% 50%)", transition: { duration: 0.8, ease: "easeInOut" } }}
        >
          {/* Static CSS Grid Background (No heavy linear gradients) */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] bg-[length:40px_40px] bg-[linear-gradient(to_right,#4fd1c5_1px,transparent_1px),linear-gradient(to_bottom,#4fd1c5_1px,transparent_1px)]" />

          {/* Corner Crosshairs */}
          <div className="absolute top-6 left-6 w-16 h-16 border-t-2 border-l-2 border-[#4fd1c5]/30 pointer-events-none" />
          <div className="absolute top-6 right-6 w-16 h-16 border-t-2 border-r-2 border-[#4fd1c5]/30 pointer-events-none" />
          <div className="absolute bottom-6 left-6 w-16 h-16 border-b-2 border-l-2 border-[#4fd1c5]/30 pointer-events-none" />
          <div className="absolute bottom-6 right-6 w-16 h-16 border-b-2 border-r-2 border-[#4fd1c5]/30 pointer-events-none" />

          {/* Hardware-Accelerated Scrolling Tickers */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute top-10 left-0 right-0 flex overflow-hidden whitespace-nowrap">
              <motion.div
                className="flex gap-4 text-xs tracking-widest uppercase"
                animate={{ x: ["0%", "-50%"] }}
                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i}>KARNATAKA POLICE &middot; SCRB &middot; ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ &middot; BIOMETRIC ENTRY SYSTEM &middot; SECURE CONNECTION ESTABLISHED &middot; </span>
                ))}
              </motion.div>
            </div>
            <div className="absolute bottom-10 left-0 right-0 flex overflow-hidden whitespace-nowrap">
              <motion.div
                className="flex gap-4 text-xs tracking-widest uppercase"
                animate={{ x: ["-50%", "0%"] }}
                transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i}>RESTRICTED ACCESS &middot; AUTHORIZED PERSONNEL ONLY &middot; MONITORING ACTIVE &middot; </span>
                ))}
              </motion.div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 w-full max-w-7xl h-full items-center p-8 gap-8">
            
            {/* Left Panel: Fingerprint & Hex Stream */}
            <div className="flex flex-col items-center justify-center relative hidden md:flex h-full w-full">
              <HexStream />
              
              <div className="relative z-10">
                <svg width="240" height="300" viewBox="-120 -150 240 300">
                  <clipPath id="fingerprint-clip">
                    <ellipse cx="0" cy="0" rx="90" ry="130" />
                  </clipPath>
                  
                  <circle cx="0" cy="0" r="145" fill="none" stroke="#4fd1c5" strokeOpacity="0.1" strokeDasharray="1 6" strokeWidth="2" />
                  <circle cx="0" cy="0" r="140" fill="none" stroke="#4fd1c5" strokeOpacity="0.2" strokeWidth="0.5" />
                  
                  <g clipPath="url(#fingerprint-clip)">
                    {RIDGES.map((_, i) => (
                      <motion.circle
                        key={i}
                        cx="0" cy="0" r={15 + i * 8}
                        fill="none"
                        stroke={matched ? "#e2a33d" : "currentColor"}
                        strokeWidth="3.5"
                        strokeDasharray="10 4 25 8 5 5"
                        initial={{ pathLength: 0, opacity: 0.1 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 1.5, delay: i * 0.08 }}
                      />
                    ))}
                    
                    {!scanned && (
                      <motion.g
                        animate={{ y: [-150, 150, -150] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      >
                        <rect x="-120" y="-4" width="240" height="11" fill="#e2a33d" opacity="0.3" />
                        <rect x="-120" y="-1" width="240" height="5" fill="#e2a33d" opacity="0.6" />
                        <rect x="-120" y="0" width="240" height="3" fill="#e2a33d" />
                        <rect x="-120" y="-20" width="240" height="20" fill="url(#laserGrad)" opacity="0.6" />
                      </motion.g>
                    )}

                    {scanned && MINUTIAE.map((m, i) => (
                      <motion.g key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: i * 0.05 }}>
                        <circle cx={m.x} cy={m.y} r="6" fill="none" stroke="#e2a33d" strokeWidth="1" />
                        <circle cx={m.x} cy={m.y} r="3" fill="none" stroke="#4fd1c5" strokeWidth="2" />
                        <circle cx={m.x} cy={m.y} r="1.5" fill="#e2a33d" />
                      </motion.g>
                    ))}
                  </g>
                  <linearGradient id="laserGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#e2a33d" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </svg>
              </div>

              {/* Scanning status UI */}
              <div className="mt-8 flex items-center gap-3 w-full max-w-[200px]">
                <div className="flex-1 h-1 bg-muted overflow-hidden rounded-full">
                  <motion.div 
                    className="h-full bg-[#4fd1c5]" 
                    initial={{ width: "0%" }}
                    animate={{ width: scanned ? "100%" : "60%" }}
                    transition={{ duration: 1.4, ease: "linear" }}
                  />
                </div>
                <div className="text-[9px] text-[#4fd1c5] font-bold uppercase tracking-[0.2em]">
                  {scanned ? "100%" : "SCANNING"}
                </div>
              </div>
            </div>

            {/* Center Panel: Terminal & Stamp */}
            <div className="flex flex-col items-center justify-center relative h-full w-full">
              {/* Karnataka Seal Watermark (Removed mix-blend-mode!) */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
                <KarnatakaSeal size={320} animated={false} />
              </div>

              <div className="flex-1 flex flex-col justify-center w-full max-w-md relative z-10">
                <TricolourThread className="mb-4 w-1/3 opacity-80" />
                <div className="border-b border-[#4fd1c5]/20 pb-2 mb-4 flex justify-between items-end">
                  <div className="text-[10px] text-[#4fd1c5]/60 uppercase tracking-widest">System Log // TTY1</div>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500/50" />
                    <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                    <div className="w-2 h-2 rounded-full bg-green-500/50" />
                  </div>
                </div>

                <div className="space-y-2 min-h-[160px]">
                  {CLEARANCE_LINES.map((text, i) => (
                    <motion.div
                      key={i}
                      className={`text-[13px] flex items-start gap-2 ${i === CLEARANCE_LINES.length - 1 ? 'text-[#e2a33d] font-bold mt-6' : 'text-muted-foreground'}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: i <= line ? 1 : 0, x: i <= line ? 0 : -10 }}
                    >
                      <span className="text-[#4fd1c5]/50 shrink-0 select-none">{i <= line && ">"}</span>
                      <span>{i <= line && text}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Huge MATCH CLEARED Stamp */}
              <AnimatePresence>
                {matched && (
                  <motion.div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50 flex flex-col items-center justify-center"
                    initial={{ scale: 3, opacity: 0, rotate: -25 }}
                    animate={{ scale: 1, opacity: 1, rotate: -15 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <div className="relative">
                      {/* Inner Stamp - Removed backdrop-blur-md! Used solid background instead. */}
                      <div className="border-[6px] border-[#e2a33d] text-[#e2a33d] px-8 py-4 md:px-12 md:py-6 rounded-2xl text-4xl md:text-5xl font-black tracking-[0.25em] whitespace-nowrap bg-background shadow-[0_0_20px_rgba(226,163,61,0.2)]">
                        MATCH &middot; CLEARED
                      </div>
                      
                      <div className="absolute -top-2 -left-2 w-4 h-4 border-t-4 border-l-4 border-[#e2a33d]" />
                      <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-4 border-r-4 border-[#e2a33d]" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Screen Flash on Match - Removed mix-blend-overlay! Just simple opacity. */}
              <AnimatePresence>
                {matched && (
                  <motion.div 
                    className="fixed inset-0 bg-[#e2a33d] z-40 pointer-events-none"
                    initial={{ opacity: 0.15 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Right Panel: Advanced Radar */}
            <div className="flex flex-col items-center justify-center relative hidden md:flex w-full h-full">
              <svg width="340" height="340" viewBox="0 0 340 340" className="relative z-10">
                <circle cx="170" cy="170" r="160" fill="none" stroke="#4fd1c5" strokeOpacity="0.15" strokeWidth="1" />
                <circle cx="170" cy="170" r="160" fill="none" stroke="#4fd1c5" strokeOpacity="0.3" strokeDasharray="2 10" />
                <circle cx="170" cy="170" r="110" fill="none" stroke="#4fd1c5" strokeOpacity="0.1" strokeWidth="1" />
                <circle cx="170" cy="170" r="60" fill="none" stroke="#4fd1c5" strokeOpacity="0.1" strokeWidth="1" />
                
                <line x1="170" y1="10" x2="170" y2="330" stroke="#4fd1c5" strokeOpacity="0.1" />
                <line x1="10" y1="170" x2="330" y2="170" stroke="#4fd1c5" strokeOpacity="0.1" />

                <path d="M140 50 L210 70 L280 160 L250 250 L180 290 L110 270 L90 200 Z" fill="#4fd1c5" fillOpacity="0.03" stroke="#4fd1c5" strokeOpacity="0.2" strokeWidth="2" />

                <motion.g
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                  style={{ originX: "170px", originY: "170px" }}
                >
                  <path d="M170 170 L170 10 A160 160 0 0 1 330 170 Z" fill="url(#advancedRadarGrad)" opacity="0.6" />
                  <linearGradient id="advancedRadarGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#e2a33d" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#4fd1c5" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                  </linearGradient>
                  
                  <line x1="170" y1="170" x2="170" y2="10" stroke="#e2a33d" strokeWidth="2" />
                  <line x1="170" y1="170" x2="170" y2="10" stroke="#e2a33d" strokeWidth="6" opacity="0.3" />
                </motion.g>

                {NETWORK_LINES.map((l, i) => {
                  const p1 = DISTRICT_PINGS[l.p1];
                  const p2 = DISTRICT_PINGS[l.p2];
                  const dx = 20, dy = 20; 
                  return (
                    <motion.line
                      key={`link-${i}`}
                      x1={p1.x + dx} y1={p1.y + dy} x2={p2.x + dx} y2={p2.y + dy}
                      stroke="#4fd1c5" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 3"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.5, delay: 1 }}
                    />
                  );
                })}

                {DISTRICT_PINGS.map((ping, i) => {
                  const dx = 20, dy = 20;
                  return (
                    <g key={i}>
                      <circle cx={ping.x + dx} cy={ping.y + dy} r="3" fill="#e2a33d" />
                      <motion.circle
                        cx={ping.x + dx} cy={ping.y + dy} r="25"
                        fill="none" stroke="#4fd1c5" strokeWidth="1.5"
                        initial={{ scale: 0, opacity: 1 }}
                        animate={{ scale: 1, opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.5, delay: ping.delay }}
                      />
                      <text x={ping.x + dx + 10} y={ping.y + dy + 4} fontSize="9" fill="currentColor" opacity="0.8" className="tracking-[0.15em] font-bold">
                        {ping.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              
              <div className="absolute bottom-10 right-4 flex flex-col items-end gap-1 text-[8px] text-[#4fd1c5]/60 uppercase tracking-widest text-right">
                <div>SYS_LAT: 12.9716 N</div>
                <div>SYS_LON: 77.5946 E</div>
                <div>NODES ACTIVE: {DISTRICT_PINGS.length}</div>
                <div>NET_SECURE: TRUE</div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
