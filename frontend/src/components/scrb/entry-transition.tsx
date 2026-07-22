import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Lively "control room booting up" login transition:
 *  1. Vault door irises open revealing a live operations console
 *  2. Satellites orbit a stylised globe with data beams shooting to ground stations
 *  3. Skyline of Bengaluru builds up brick-by-brick, patrol beacons blink
 *  4. Case files fly in and stack, evidence tags snap on
 *  5. Badge unfolds, chakra spins, "CLEARED" seal locks in
 *  6. Curtain wipe reveals workspace
 */

const AMBER = "rgb(226,163,61)";
const TEAL = "rgb(94,196,178)";

// Bengaluru-ish skyline silhouette bars
const BUILDINGS = [
  { x: 20, w: 26, h: 70 },
  { x: 52, w: 34, h: 110 },
  { x: 92, w: 22, h: 55 },
  { x: 120, w: 30, h: 140 },
  { x: 156, w: 26, h: 85 },
  { x: 188, w: 40, h: 165 },
  { x: 234, w: 22, h: 70 },
  { x: 262, w: 34, h: 125 },
  { x: 302, w: 26, h: 90 },
  { x: 334, w: 30, h: 150 },
  { x: 370, w: 22, h: 65 },
];

const CASE_FILES = [
  { id: "FIR-2401", color: AMBER, tag: "OPEN" },
  { id: "FIR-2387", color: TEAL, tag: "LEAD" },
  { id: "FIR-2412", color: AMBER, tag: "HOT" },
  { id: "FIR-2359", color: TEAL, tag: "SYNC" },
  { id: "FIR-2440", color: AMBER, tag: "NEW" },
];

const GROUND_STATIONS = [
  { x: 90, y: 220, label: "BLR" },
  { x: 210, y: 250, label: "MYS" },
  { x: 320, y: 210, label: "MNG" },
  { x: 380, y: 155, label: "HBL" },
];

const INTEL_TOASTS = [
  { icon: "▲", text: "ANPR hit · KA-05-MG-2419", tone: AMBER },
  { icon: "◆", text: "CDR match · +91 98•• ••42", tone: TEAL },
  { icon: "✚", text: "Bio-print quality 0.97", tone: AMBER },
  { icon: "◈", text: "Warrant registry synced", tone: TEAL },
  { icon: "▲", text: "Face-match · 92.4%", tone: AMBER },
];

// Morse-ish beacon pattern
const MORSE = [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1];

export function EntryTransition({ show }: { show: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const [phase, setPhase] = useState(0);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [ecg, setEcg] = useState(0);

  useEffect(() => {
    if (!show) return;
    setPhase(0);
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1300),
      setTimeout(() => setPhase(4), 1600),
    ];
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener("mousemove", onMove);
    const ecgTimer = setInterval(() => setEcg((v) => v + 1), 80);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("mousemove", onMove);
      clearInterval(ecgTimer);
    };
  }, [show]);

  const parallaxX = (mouse.x - 0.5) * 24;
  const parallaxY = (mouse.y - 0.5) * 24;


  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="entry"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0a0d12] dark:text-white"
        >
          {/* Blueprint grid + vignette */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                `linear-gradient(${isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)"} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)"} 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
              maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 90%)",
            }}
          />

          {/* Floating particles */}
          {Array.from({ length: 30 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-amber/60"
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 71) % 100}%`,
              }}
              animate={{
                y: [0, -40, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 3 + (i % 4),
                repeat: Infinity,
                delay: (i % 10) * 0.3,
                ease: "easeInOut",
              }}
            />
          ))}

          {/* Top classification ticker */}
          <motion.div
            className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-slate-300 dark:border-white/10 bg-white/80 dark:bg-black/40 px-6 py-2 font-mono text-[10px] tracking-[0.35em] text-amber uppercase backdrop-blur"
            initial={{ y: -30 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            <span>Restricted · KSP Ops Console · Session 0x{Date.now().toString(16).slice(-6).toUpperCase()}</span>
            <span className="ml-auto text-slate-500 dark:text-white/40">TLS 1.3 · BLR-01 · 12ms</span>
          </motion.div>

          {/* Cursor spotlight */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[5] transition-[background] duration-100"
            style={{
              background: `radial-gradient(400px circle at ${mouse.x * 100}% ${mouse.y * 100}%, rgba(226,163,61,0.10), transparent 60%)`,
            }}
          />

          {/* Parallax crosshair reticle following cursor */}
          <motion.svg
            aria-hidden
            className="pointer-events-none absolute z-[6]"
            width="120"
            height="120"
            style={{
              left: `calc(${mouse.x * 100}% - 60px)`,
              top: `calc(${mouse.y * 100}% - 60px)`,
            }}
          >
            <motion.circle
              cx="60"
              cy="60"
              r="40"
              fill="none"
              stroke={AMBER}
              strokeWidth="0.8"
              strokeDasharray="4 6"
              opacity="0.35"
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              style={{ transformOrigin: "60px 60px" }}
            />
            <line x1="60" y1="20" x2="60" y2="45" stroke={AMBER} strokeWidth="0.6" opacity="0.5" />
            <line x1="60" y1="75" x2="60" y2="100" stroke={AMBER} strokeWidth="0.6" opacity="0.5" />
            <line x1="20" y1="60" x2="45" y2="60" stroke={AMBER} strokeWidth="0.6" opacity="0.5" />
            <line x1="75" y1="60" x2="100" y2="60" stroke={AMBER} strokeWidth="0.6" opacity="0.5" />
            <circle cx="60" cy="60" r="1.5" fill={AMBER} />
          </motion.svg>

          {/* Morse beacon ring (top-right) */}
          <div className="absolute top-14 right-6 z-10 flex flex-col items-end gap-2">
            <div className="font-mono text-[9px] tracking-[0.3em] text-slate-500 dark:text-white/40 uppercase">◆ Beacon</div>
            <div className="flex items-center gap-1">
              {MORSE.map((m, i) => (
                <motion.span
                  key={i}
                  className="block rounded-full"
                  style={{
                    width: m ? 10 : 4,
                    height: 4,
                    backgroundColor: m ? AMBER : (isDark ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.3)"),
                  }}
                  animate={{ opacity: [(i + ecg) % 6 === 0 ? 1 : 0.35, m ? 1 : 0.4] }}
                  transition={{ duration: 0.4 }}
                />
              ))}
            </div>
          </div>

          {/* Live ECG-style waveform (top-left) */}
          <div className="absolute top-14 left-6 z-10 flex flex-col gap-1">
            <div className="font-mono text-[9px] tracking-[0.3em] text-slate-500 dark:text-white/40 uppercase">◆ Signal · 72 BPM</div>
            <svg width="220" height="44" viewBox="0 0 220 44" className="overflow-visible">
              <defs>
                <linearGradient id="ecgFade" x1="0" x2="1">
                  <stop offset="0%" stopColor={TEAL} stopOpacity="0" />
                  <stop offset="30%" stopColor={TEAL} stopOpacity="0.9" />
                  <stop offset="100%" stopColor={TEAL} stopOpacity="1" />
                </linearGradient>
              </defs>
              {Array.from({ length: 6 }).map((_, i) => {
                const off = ((ecg * 6) + i * 40) % 260 - 40;
                return (
                  <path
                    key={i}
                    d={`M ${off} 22 L ${off + 8} 22 L ${off + 12} 6 L ${off + 16} 38 L ${off + 20} 14 L ${off + 26} 22 L ${off + 40} 22`}
                    fill="none"
                    stroke="url(#ecgFade)"
                    strokeWidth="1.4"
                  />
                );
              })}
              <line x1="0" y1="22" x2="220" y2="22" stroke="rgba(94,196,178,0.15)" strokeWidth="0.5" />
            </svg>
          </div>

          {/* Corner fingerprint auth widget (bottom-right, above ticker) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 20 }}
            transition={{ duration: 0.5 }}
            className="absolute right-6 bottom-12 z-10 flex items-center gap-3 rounded-lg border border-amber/30 bg-white/80 dark:bg-black/40 px-3 py-2 backdrop-blur"
          >
            <svg width="34" height="34" viewBox="0 0 34 34">
              {[6, 9, 12, 15].map((r, i) => (
                <motion.circle
                  key={r}
                  cx="17"
                  cy="17"
                  r={r}
                  fill="none"
                  stroke={AMBER}
                  strokeWidth="1"
                  strokeDasharray={`${r * 1.2} ${r * 3}`}
                  animate={{ rotate: i % 2 ? 360 : -360 }}
                  transition={{ duration: 6 + i * 2, repeat: Infinity, ease: "linear" }}
                  style={{ transformOrigin: "17px 17px" }}
                />
              ))}
              <motion.rect
                x="4"
                y="15"
                width="26"
                height="1.4"
                fill={TEAL}
                animate={{ y: [4, 28, 4] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </svg>
            <div className="flex flex-col">
              <span className="font-mono text-[9px] tracking-[0.3em] text-slate-500 dark:text-white/50 uppercase">Bio · Auth</span>
              <span className="font-mono text-[11px] tracking-widest text-amber">MATCH 0.97</span>
            </div>
          </motion.div>

          {/* Incoming intel toasts (left column, floating up) */}
          <div className="absolute bottom-16 left-6 z-10 flex w-64 flex-col-reverse gap-2">
            <AnimatePresence>
              {phase >= 1 &&
                INTEL_TOASTS.map((t, i) => (
                  <motion.div
                    key={t.text}
                    initial={{ opacity: 0, y: 30, x: -30 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ delay: 0.5 + i * 0.32, type: "spring", stiffness: 160, damping: 18 }}
                    className="flex items-center gap-2 rounded-md border bg-white/80 dark:bg-black/40 px-3 py-1.5 backdrop-blur"
                    style={{ borderColor: `${t.tone.slice(0, -1)},0.35)` }}
                  >
                    <span style={{ color: t.tone }} className="font-mono text-[11px]">
                      {t.icon}
                    </span>
                    <span className="font-mono text-[10px] tracking-widest text-slate-700 dark:text-white/75 uppercase">{t.text}</span>
                    <motion.span
                      className="ml-auto h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: t.tone }}
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>

          {/* Parallax constellation layer */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[4]"
            style={{ x: parallaxX, y: parallaxY }}
          >
            <svg className="h-full w-full opacity-30">
              {Array.from({ length: 40 }).map((_, i) => {
                const x = (i * 137) % 100;
                const y = (i * 89) % 100;
                return (
                  <motion.circle
                    key={i}
                    cx={`${x}%`}
                    cy={`${y}%`}
                    r={i % 5 === 0 ? 1.4 : 0.7}
                    fill={i % 3 === 0 ? TEAL : AMBER}
                    animate={{ opacity: [0.2, 0.9, 0.2] }}
                    transition={{ duration: 2 + (i % 4), repeat: Infinity, delay: (i % 7) * 0.2 }}
                  />
                );
              })}
            </svg>
          </motion.div>


          {/* ============ Vault door iris opening ============ */}
          <AnimatePresence>
            {phase < 1 && (
              <>
                <motion.div
                  key="vault-l"
                  initial={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
                  className="absolute inset-y-0 left-0 z-40 w-1/2 border-r-2 border-amber/40 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-[#050708] dark:to-[#0f141a]"
                >
                  <div className="absolute top-1/2 right-0 flex -translate-y-1/2 translate-x-1/2 items-center justify-center">
                    <motion.div
                      className="h-32 w-32 rounded-full border-4 border-amber/60"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    >
                      <div className="absolute inset-2 rounded-full border-2 border-dashed border-amber/40" />
                      <div className="absolute inset-6 flex items-center justify-center rounded-full bg-amber/10 font-mono text-[10px] tracking-widest text-amber">
                        LOCK
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
                <motion.div
                  key="vault-r"
                  initial={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
                  className="absolute inset-y-0 right-0 z-40 w-1/2 border-l-2 border-amber/40 bg-gradient-to-l from-slate-100 to-slate-200 dark:from-[#050708] dark:to-[#0f141a]"
                />
              </>
            )}
          </AnimatePresence>

          {/* ============ Main console layout ============ */}
          <div className="relative z-10 grid h-full grid-cols-1 items-center gap-8 px-8 pt-14 pb-14 md:grid-cols-3 md:px-14">
            {/* -------- LEFT: Orbiting globe / satellites -------- */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : -30 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center"
            >
              <div className="mb-3 font-mono text-[10px] tracking-[0.35em] text-slate-500 dark:text-white/50 uppercase">
                ◆ Uplink · Satellites
              </div>
              <div className="relative">
                <svg width="280" height="280" viewBox="-140 -140 280 280">
                  {/* Outer decorative rings */}
                  {[130, 110, 90].map((r, i) => (
                    <motion.circle
                      key={r}
                      cx="0"
                      cy="0"
                      r={r}
                      fill="none"
                      stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.12)" }
                      strokeDasharray={i === 1 ? "3 6" : "0"}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.2, delay: 0.1 * i }}
                    />
                  ))}

                  {/* Globe */}
                  <motion.circle
                    cx="0"
                    cy="0"
                    r="60"
                    fill="url(#globeGrad)"
                    stroke={AMBER}
                    strokeWidth="1"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 180, damping: 15, delay: 0.2 }}
                  />
                  <defs>
                    <radialGradient id="globeGrad">
                      <stop offset="0%" stopColor="rgba(226,163,61,0.3)" />
                      <stop offset="100%" stopColor="rgba(226,163,61,0.05)" />
                    </radialGradient>
                  </defs>
                  {/* Latitude/longitude */}
                  {[-40, -20, 0, 20, 40].map((y) => (
                    <ellipse key={y} cx="0" cy={y * 0.3} rx="60" ry={60 - Math.abs(y)} fill="none" stroke={isDark ? "rgba(255,255,255,0.15)" : "rgba(15,23,42,0.22499999999999998)" } strokeWidth="0.5" />
                  ))}
                  <line x1="0" y1="-60" x2="0" y2="60" stroke={isDark ? "rgba(255,255,255,0.15)" : "rgba(15,23,42,0.22499999999999998)" } strokeWidth="0.5" />

                  {/* Karnataka pin */}
                  <motion.circle
                    cx="8"
                    cy="4"
                    r="4"
                    fill={AMBER}
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />

                  {/* Orbiting satellites */}
                  {[
                    { r: 90, dur: 4, delay: 0, size: 5 },
                    { r: 110, dur: 6, delay: 0.5, size: 4 },
                    { r: 130, dur: 8, delay: 1, size: 6 },
                  ].map((s, i) => (
                    <motion.g
                      key={i}
                      style={{ transformOrigin: "0px 0px" }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: s.dur, repeat: Infinity, ease: "linear", delay: s.delay }}
                    >
                      <circle cx={s.r} cy="0" r={s.size} fill={i % 2 ? TEAL : AMBER} />
                      <rect x={s.r - 10} y="-1" width="20" height="2" fill={i % 2 ? TEAL : AMBER} opacity="0.5" />
                      <motion.line
                        x1={s.r}
                        y1="0"
                        x2="0"
                        y2="0"
                        stroke={i % 2 ? TEAL : AMBER}
                        strokeWidth="0.5"
                        strokeDasharray="2 3"
                        opacity="0.4"
                      />
                    </motion.g>
                  ))}
                </svg>

                {/* Signal strength bars */}
                <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-end gap-1">
                  {[6, 10, 14, 18, 22].map((h, i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 rounded-sm bg-teal-soft"
                      style={{ height: h }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.4 + i * 0.08, duration: 0.3 }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-6 font-mono text-[10px] tracking-[0.3em] text-teal-soft uppercase">
                4 sats · locked
              </div>
            </motion.div>

            {/* -------- CENTER: Badge + skyline -------- */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative flex flex-col items-center"
            >
              {/* Unfolding badge */}
              <div className="relative mb-6">
                <motion.div
                  initial={{ rotateY: 90, scale: 0.5 }}
                  animate={{ rotateY: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.3 }}
                  className="relative"
                  style={{ perspective: 800 }}
                >
                  <svg width="180" height="180" viewBox="-90 -90 180 180">
                    {/* Badge shield */}
                    <motion.path
                      d="M 0 -80 L 70 -50 L 65 30 Q 60 60 0 80 Q -60 60 -65 30 L -70 -50 Z"
                      fill="url(#badgeGrad)"
                      stroke={AMBER}
                      strokeWidth="2"
                    />
                    <defs>
                      <linearGradient id="badgeGrad" x1="0" y1="-1" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(226,163,61,0.25)" />
                        <stop offset="100%" stopColor="rgba(226,163,61,0.05)" />
                      </linearGradient>
                    </defs>
                    {/* Chakra */}
                    <motion.g
                      style={{ transformOrigin: "0px 0px" }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    >
                      <circle cx="0" cy="0" r="30" fill="none" stroke={AMBER} strokeWidth="1.5" />
                      {Array.from({ length: 24 }).map((_, i) => {
                        const a = (i * Math.PI) / 12;
                        return (
                          <line
                            key={i}
                            x1={Math.cos(a) * 8}
                            y1={Math.sin(a) * 8}
                            x2={Math.cos(a) * 28}
                            y2={Math.sin(a) * 28}
                            stroke={AMBER}
                            strokeWidth="1"
                            opacity="0.7"
                          />
                        );
                      })}
                      <circle cx="0" cy="0" r="6" fill={AMBER} />
                    </motion.g>
                    {/* Wing accents */}
                    <path d="M -40 -30 Q -60 -20 -50 0" stroke={AMBER} strokeWidth="1.2" fill="none" opacity="0.6" />
                    <path d="M 40 -30 Q 60 -20 50 0" stroke={AMBER} strokeWidth="1.2" fill="none" opacity="0.6" />
                    {/* Bottom ribbon */}
                    <rect x="-32" y="45" width="64" height="14" rx="2" fill={isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.8)" } stroke={AMBER} strokeWidth="0.8" />
                    <text x="0" y="55" textAnchor="middle" fontSize="7" fontFamily="monospace" fill={AMBER} letterSpacing="2">
                      KSP · SCRB
                    </text>
                  </svg>

                  {/* Pulse rings around badge */}
                  {[0, 0.5, 1].map((d) => (
                    <motion.div
                      key={d}
                      className="absolute inset-0 rounded-full border border-amber/40"
                      animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                      transition={{ duration: 2, delay: d, repeat: Infinity, ease: "easeOut" }}
                    />
                  ))}
                </motion.div>
              </div>

              {/* Skyline */}
              <div className="w-full">
                <svg viewBox="0 0 400 200" className="w-full">
                  {/* Sun/moon glow */}
                  <motion.circle
                    cx="320"
                    cy="60"
                    r="24"
                    fill="rgba(226,163,61,0.2)"
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  />
                  <circle cx="320" cy="60" r="12" fill={AMBER} opacity="0.6" />

                  {/* Buildings */}
                  {BUILDINGS.map((b, i) => (
                    <motion.g key={i}>
                      <motion.rect
                        x={b.x}
                        width={b.w}
                        height={b.h}
                        fill={isDark ? "#0f1520" : "#e2e8f0"}
                        stroke="rgba(226,163,61,0.4)"
                        strokeWidth="0.8"
                        initial={{ y: 200, height: 0 }}
                        animate={{ y: 200 - b.h, height: b.h }}
                        transition={{ duration: 0.6, delay: 0.4 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      />
                      {/* Windows */}
                      {Array.from({ length: Math.floor(b.h / 14) }).map((_, r) =>
                        Array.from({ length: Math.floor(b.w / 8) }).map((_, c) => (
                          <motion.rect
                            key={`${r}-${c}`}
                            x={b.x + 2 + c * 8}
                            y={200 - b.h + 4 + r * 14}
                            width="4"
                            height="6"
                            fill={AMBER}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 0.8, 0.4] }}
                            transition={{
                              delay: 0.8 + i * 0.05 + (r + c) * 0.02,
                              duration: 0.8,
                              repeat: Infinity,
                              repeatDelay: 3 + (i % 3),
                            }}
                          />
                        )),
                      )}
                    </motion.g>
                  ))}

                  {/* Patrol beacon (rotating blue/red flash on tallest building) */}
                  <motion.circle
                    cx="208"
                    cy="35"
                    r="3"
                    animate={{ fill: ["#3b82f6", "#ef4444", "#3b82f6"] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                  <motion.circle
                    cx="208"
                    cy="35"
                    r="8"
                    fill="none"
                    animate={{ stroke: ["#3b82f6", "#ef4444", "#3b82f6"], opacity: [0.6, 0.2, 0.6] }}
                    strokeWidth="1"
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />

                  {/* Ground line */}
                  <line x1="0" y1="200" x2="400" y2="200" stroke={AMBER} strokeWidth="1" opacity="0.5" />

                  {/* Ground stations */}
                  {GROUND_STATIONS.map((g, i) => (
                    <g key={i}>
                      <motion.circle
                        cx={g.x}
                        cy={g.y}
                        r="3"
                        fill={TEAL}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 1 + i * 0.15 }}
                      />
                      <motion.circle
                        cx={g.x}
                        cy={g.y}
                        r="10"
                        fill="none"
                        stroke={TEAL}
                        strokeWidth="0.8"
                        animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                        transition={{ duration: 2, delay: 1.2 + i * 0.2, repeat: Infinity }}
                        style={{ transformOrigin: `${g.x}px ${g.y}px` }}
                      />
                    </g>
                  ))}
                </svg>
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: phase >= 2 ? 1 : 0 }}
                className="mt-2 font-mono text-[10px] tracking-[0.35em] text-slate-600 dark:text-white/60 uppercase"
              >
                Bengaluru command · online
              </motion.div>
            </motion.div>

            {/* -------- RIGHT: Case files stacking + telemetry -------- */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : 30 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col items-center"
            >
              <div className="mb-3 font-mono text-[10px] tracking-[0.35em] text-slate-500 dark:text-white/50 uppercase">
                ◆ Case Files · Syncing
              </div>

              {/* Flying case files */}
              <div className="relative h-56 w-56">
                {CASE_FILES.map((f, i) => (
                  <motion.div
                    key={f.id}
                    className="absolute inset-x-0 mx-auto w-44 rounded-md border bg-slate-100 dark:bg-white/[0.04] p-3 backdrop-blur"
                    style={{
                      borderColor: `${f.color.slice(0, -1)},0.4)`,
                      top: `${i * 18}px`,
                      zIndex: CASE_FILES.length - i,
                    }}
                    initial={{
                      x: i % 2 ? 300 : -300,
                      y: -100,
                      rotate: i % 2 ? 30 : -30,
                      opacity: 0,
                    }}
                    animate={{
                      x: (i - 2) * 4,
                      y: 0,
                      rotate: (i - 2) * 2,
                      opacity: 1,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 140,
                      damping: 14,
                      delay: 0.5 + i * 0.12,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] tracking-widest text-slate-700 dark:text-white/80">{f.id}</span>
                      <span
                        className="rounded-sm px-1.5 py-0.5 font-mono text-[8px] tracking-widest"
                        style={{ backgroundColor: `${f.color.slice(0, -1)},0.15)`, color: f.color }}
                      >
                        {f.tag}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="h-1 w-full rounded bg-slate-200 dark:bg-white/10" />
                      <div className="h-1 w-3/4 rounded bg-slate-200 dark:bg-white/10" />
                      <div className="h-1 w-1/2 rounded bg-slate-200 dark:bg-white/10" />
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Telemetry bars */}
              <div className="mt-4 w-full max-w-[220px] space-y-2">
                {[
                  { label: "Ingest", pct: 100, color: AMBER },
                  { label: "Match", pct: 87, color: TEAL },
                  { label: "Enroll", pct: 100, color: AMBER },
                ].map((t, i) => (
                  <div key={t.label}>
                    <div className="flex justify-between font-mono text-[9px] tracking-widest text-slate-500 dark:text-white/50 uppercase">
                      <span>{t.label}</span>
                      <motion.span
                        style={{ color: t.color }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.5 + i * 0.2 }}
                      >
                        {t.pct}%
                      </motion.span>
                    </div>
                    <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                      <motion.div
                        className="h-full"
                        style={{ backgroundColor: t.color }}
                        initial={{ width: "0%" }}
                        animate={{ width: `${t.pct}%` }}
                        transition={{ duration: 1.2, delay: 1.2 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* CLEARED stamp */}
          <AnimatePresence>
            {phase >= 3 && (
              <motion.div
                initial={{ opacity: 0, scale: 4, rotate: -25 }}
                animate={{ opacity: 1, scale: 1, rotate: -8 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 15 }}
                className="pointer-events-none absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
              >
                <div className="rounded-lg border-[3px] border-amber bg-white/90 dark:bg-black/60 px-6 py-2 font-mono text-lg font-bold tracking-[0.4em] text-amber uppercase backdrop-blur [text-shadow:0_0_24px_rgba(226,163,61,0.6)]">
                  ✓ Cleared · Access Granted
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom telemetry ticker */}
          <div className="absolute inset-x-0 bottom-0 border-t border-slate-300 dark:border-white/10 bg-white/80 dark:bg-black/40 backdrop-blur">
            <div className="flex items-center gap-6 overflow-hidden px-6 py-2 font-mono text-[10px] tracking-[0.3em] text-slate-500 dark:text-white/50 uppercase">
              <motion.div
                className="flex shrink-0 gap-8"
                animate={{ x: [0, -1200] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <span key={i} className="flex shrink-0 items-center gap-3">
                    <span className="text-teal-soft">▲</span> node blr-01 healthy
                    <span className="text-amber">◆</span> ingest queue 0
                    <span className="text-teal-soft">▲</span> 4 satellites locked
                    <span className="text-amber">◆</span> handshake ok
                    <span className="text-teal-soft">▲</span> audit chain sealed
                  </span>
                ))}
              </motion.div>
            </div>
          </div>

          {/* Curtain wipe exit */}
          <motion.div
            aria-hidden
            initial={{ scaleY: 0 }}
            exit={{ scaleY: 1 }}
            transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
            style={{ transformOrigin: "top" }}
            className="pointer-events-none absolute inset-0 z-50 bg-background"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
