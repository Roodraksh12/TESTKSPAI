"use client";

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Fingerprint, ShieldCheck, ArrowRight, Lock, Sparkles, FileSearch, Radio, Scale } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  Button,
  Input,
} from "@/components/scrb/primitives";
import { SealMark } from "@/components/scrb/insignia";
import { ModeToggle } from "@/components/scrb/mode-toggle";
import { EntryTransition } from "@/components/scrb/entry-transition";

const FEATURES = [
  { icon: Sparkles, label: "Source-cited copilot", copy: "Every answer cites the FIR, ledger or MO cluster it drew from." },
  { icon: FileSearch, label: "Entity linkage", copy: "Names, plates and aliases reconciled across cases in seconds." },
  { icon: Radio, label: "Live hotspots", copy: "Beat-level risk maps refreshed hourly for patrol planning." },
  { icon: Scale, label: "Human oversight", copy: "No coercive action on AI alone — confirmation is mandatory." },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [district, setDistrict] = useState("Bengaluru City");
  const [station, setStation] = useState("Cubbon Park");
  const [badgeId, setBadgeId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Sample data for the dropdowns
  const DISTRICTS = [
    "Bengaluru City",
    "Mysuru City",
    "Mangaluru City",
    "Hubballi-Dharwad City",
    "Belagavi City",
  ];

  const STATIONS: Record<string, string[]> = {
    "Bengaluru City": ["Cubbon Park", "Vidhana Soudha", "High Grounds", "Halasuru", "Indiranagar"],
    "Mysuru City": ["Devaraja", "Krishnaraja", "Lashkar", "Mandi", "Narasimharaja"],
    "Mangaluru City": ["Barke", "Bunder", "Kadri", "Kankanady", "Pandeshwar"],
    "Hubballi-Dharwad City": ["Suburban", "Town", "Vidyanagar", "Gokul Road", "Keshwapur"],
    "Belagavi City": ["Camp", "Khadebazar", "Market", "Shahapur", "Tilakwadi"],
  };

  const availableStations = STATIONS[district] || ["Select Station"];

  const handleSignIn = async (useDemo: boolean) => {
    setSubmitting(true);
    setError("");
    
    const loginBadge = useDemo ? "KA-INS-4471" : badgeId;
    const loginPass = useDemo ? "demo1234" : password;

    try {
      await login(loginBadge, loginPass);
      // Wait for the transition animation
      setTimeout(() => navigate("/dashboard"), 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid Badge ID or Password";
      setError(message.includes("Failed to fetch") || message.includes("NetworkError")
        ? "Cannot reach API. Is the backend running on http://localhost:8000?"
        : message);
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground transition-colors">
      <ModeToggle className="fixed right-6 top-6" />
      <AmbientCursor />
      <div className="relative mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 items-center gap-10 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-12">
        {/* LEFT — interactive hero */}
        <HeroPanel />

        {/* RIGHT — login card */}
        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white">
              <SealMark size={24} />
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight">SCRB Sahayak</p>
              <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Karnataka Police
              </p>
            </div>
          </div>

          <TiltCard>
            <div className="rounded-3xl border border-hairline bg-surface p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                    Officer sign-in
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    Namaskara, Inspector.
                  </h1>
                </div>
                <MagneticSeal />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSignIn(false);
                }}
                className="mt-6 space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                      District
                    </label>
                    <div className="relative">
                      <select
                        value={district}
                        onChange={(e) => {
                          setDistrict(e.target.value);
                          setStation(STATIONS[e.target.value]?.[0] || "");
                        }}
                        className="flex h-11 w-full rounded-2xl border border-hairline bg-surface-2 px-4 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                      >
                        {DISTRICTS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                        <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                      Station
                    </label>
                    <div className="relative">
                      <select
                        value={station}
                        onChange={(e) => setStation(e.target.value)}
                        className="flex h-11 w-full rounded-2xl border border-hairline bg-surface-2 px-4 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                      >
                        {availableStations.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                        <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                    Badge ID
                  </label>
                  <div className="relative">
                    <Input
                      value={badgeId}
                      onChange={(e) => setBadgeId(e.target.value)}
                      placeholder="KA-00000"
                      className="text-mono pl-9 uppercase"
                    />
                    <Fingerprint className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9"
                    />
                    <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                {error && <p className="text-red-500 text-[11px]">{error}</p>}

                <div className="pt-2">
                  <MagneticButton>
                    <Button variant="primary" size="lg" className="w-full" disabled={submitting}>
                      {submitting ? "Loading..." : (<>Enter workspace <ArrowRight className="h-4 w-4" /></>)}
                    </Button>
                  </MagneticButton>
                  <button
                    type="button"
                    onClick={() => handleSignIn(true)}
                    className="mt-2 w-full rounded-2xl border border-hairline bg-surface px-5 py-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    Use demo credentials
                  </button>
                </div>
              </form>

              <div className="mt-6 flex items-start gap-2 rounded-2xl border border-hairline bg-surface-2 p-3">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Unauthorised access to police records is punishable under Sec. 66 IT Act and the
                  Karnataka Police Manual. All activity is logged.
                </p>
              </div>
            </div>
          </TiltCard>

        </div>
      </div>
      <EntryTransition show={submitting} />
    </main>
  );
}

/* ---------- interactive bits ---------- */

/** Full-page cursor-following spotlight + soft parallax dots. */
function AmbientCursor() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      el.style.setProperty("--mx", `${x}%`);
      el.style.setProperty("--my", `${y}%`);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        // @ts-expect-error css vars
        "--mx": "50%",
        "--my": "40%",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(600px circle at var(--mx) var(--my), color-mix(in oklab, var(--amber) 18%, transparent), transparent 55%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px circle at calc(100% - var(--mx)) calc(100% - var(--my)), color-mix(in oklab, var(--teal) 14%, transparent), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08] dark:opacity-10 text-[#0f172a] dark:text-white"
        style={{
          backgroundImage:
            "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(ellipse 60% 60% at var(--mx) var(--my), black 20%, transparent 75%)",
        }}
      />
    </div>
  );
}

/** Left panel with wordmark, feature strip, and cursor-reactive marquee stats. */
function HeroPanel() {
  return (
    <div className="relative hidden min-w-0 flex-col justify-between lg:flex">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white">
            <SealMark size={28} />
          </div>
          <div className="leading-tight">
            <p className="text-[16px] font-semibold tracking-tight">SCRB Sahayak</p>
            <p className="text-[10px] tracking-widest text-muted-foreground uppercase">
              Karnataka Police · State Crime Records Bureau
            </p>
          </div>
        </div>

        <h2 className="mt-10 max-w-lg text-[44px] leading-[1.05] font-normal tracking-tight text-display">
          An investigation copilot,
          <br />
          <span className="italic text-amber-soft">purpose-built for KSP.</span>
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          Link cases, spot hotspots and draft dossiers with source-cited answers —
          calm, auditable and always officer-in-the-loop.
        </p>

        <div className="mt-8 grid max-w-lg grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <FeatureTile key={f.label} {...f} />
          ))}
        </div>
      </div>

      <LiveTicker />
    </div>
  );
}

function FeatureTile({ icon: Icon, label, copy }: { icon: typeof Sparkles; label: string; copy: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--tx", `${e.clientX - r.left}px`);
    el.style.setProperty("--ty", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className="group relative overflow-hidden rounded-2xl border border-hairline bg-surface p-4 transition hover:-translate-y-0.5 hover:border-foreground/20"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(180px circle at var(--tx,50%) var(--ty,50%), color-mix(in oklab, var(--amber) 22%, transparent), transparent 60%)",
        }}
      />
      <div className="relative flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <p className="text-sm font-medium">{label}</p>
      </div>
      <p className="relative mt-2 text-[12px] leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  );
}

/** Fake live ticker of ingested records to add motion at the bottom of the panel. */
function LiveTicker() {
  const items = [
    "FIR-2026-1042 · linked to 1039",
    "MO cluster \"Chotu\" · +2 witness matches",
    "Hotspot · HAL 2nd Stage ↑9 this week",
    "Dossier drafted · Cheque fraud Jayanagar",
    "New intake · FIR-2026-1101",
  ];
  return (
    <div className="mt-10 overflow-hidden rounded-full border border-hairline bg-surface">
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
        </span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
          Live
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="flex gap-8 whitespace-nowrap animate-[marquee_28s_linear_infinite]">
            {[...items, ...items].map((t, i) => (
              <span key={i} className="text-mono text-[11px] text-foreground/80">
                · {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  );
}

/** Card that tilts subtly toward the cursor, with a spotlight sheen. */
function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * 6;
    const ry = (px - 0.5) * 6;
    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
    el.style.setProperty("--sx", `${px * 100}%`);
    el.style.setProperty("--sy", `${py * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="group relative [perspective:1200px]"
    >
      <div
        className="relative transition-transform duration-200 ease-out will-change-transform"
        style={{
          transform:
            "rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))",
          transformStyle: "preserve-3d",
        }}
      >
        {children}
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(400px circle at var(--sx,50%) var(--sy,50%), rgba(255,255,255,0.5), transparent 55%)",
            mixBlendMode: "overlay",
          }}
        />
      </div>
    </div>
  );
}

/** Seal that magnetically follows the cursor within a small radius. */
function MagneticSeal() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const max = 220;
      if (dist > max) {
        el.style.transform = `translate(0,0)`;
        return;
      }
      const strength = (1 - dist / max) * 10;
      el.style.transform = `translate(${(dx / max) * strength}px, ${(dy / max) * strength}px)`;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div
      ref={ref}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white transition-transform duration-150 ease-out"
    >
      <SealMark size={30} />
    </div>
  );
}

/** Wraps the primary submit button with a subtle magnetic pull. */
function MagneticButton({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${dx * 0.08}px, ${dy * 0.15}px)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = `translate(0,0)`;
  };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className="transition-transform duration-200 ease-out">
      {children}
    </div>
  );
}
