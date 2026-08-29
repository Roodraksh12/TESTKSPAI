"use client";

import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Fingerprint, ShieldCheck, ArrowRight, Lock, Eye, EyeOff, Sparkles, FileSearch, Radio, Scale } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Button,
  Input,
} from "@/components/scrb/primitives";
import { SealMark } from "@/components/scrb/insignia";
import { ModeToggle } from "@/components/scrb/mode-toggle";
import { EntryTransition } from "@/components/scrb/entry-transition";

const FEATURES = [
  { icon: Sparkles, label: "Grounded copilot", copy: "Record-backed searches show the supporting case references used in the answer." },
  { icon: FileSearch, label: "Officer-reviewed links", copy: "Shared names, plates and recorded relationships are surfaced for review." },
  { icon: Radio, label: "Explainable alerts", copy: "Seven-day activity is compared with the preceding 28-day baseline." },
  { icon: Scale, label: "Human oversight", copy: "No coercive action on AI alone — confirmation is mandatory." },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [badgeId, setBadgeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    setSubmitting(true);
    setError("");

    try {
      const user = await login(badgeId, password);
      if (user?.mustChangePassword || user?.status === "MUST_CHANGE_PASSWORD") {
        setSubmitting(false);
        navigate("/change-password");
      } else {
        // Wait for the entry transition animation
        setTimeout(() => {
          navigate(user?.capabilities?.defaultHome || "/dashboard");
          setSubmitting(false);
        }, 1800);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid Service ID or Password";
      setError(message.includes("Failed to fetch") || message.includes("NetworkError")
        ? "Cannot reach API. The backend may be down or rejecting the request due to CORS."
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

              <p className="mt-4 rounded-xl border border-amber/20 bg-amber/5 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                Synthetic demo data only · Not connected to CCTNS, ICJS or a production police database
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSignIn();
                }}
                className="mt-6 space-y-3"
              >
                <div>
                  <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                    Service ID / Badge ID
                  </label>
                  <div className="relative">
                    <Input
                      value={badgeId}
                      onChange={(e) => setBadgeId(e.target.value.toUpperCase())}
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
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                    />
                    <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-1.5 text-right">
                    <Link to="/forgot-password" className="text-[11px] text-teal hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                </div>

                {error && <p className="text-red-500 text-[11px]">{error}</p>}

                <div className="pt-2">
                  <MagneticButton>
                    <Button variant="primary" size="lg" className="w-full" disabled={submitting}>
                      {submitting ? "Loading..." : (<>Enter workspace <ArrowRight className="h-4 w-4" /></>)}
                    </Button>
                  </MagneticButton>
                </div>
              </form>

              <div className="mt-6 flex items-start gap-2 rounded-2xl border border-hairline bg-surface-2 p-3">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Access is restricted to authorised demo accounts. Important activity in this
                  prototype is recorded for review.
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
          </div>
        </div>

        <h2 className="mt-10 max-w-lg text-[44px] leading-[1.05] font-normal tracking-tight text-display">
          An investigation copilot,
          <br />
          <span className="italic text-amber-soft">designed for the KSP challenge.</span>
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          Search synthetic case records, trace links and prepare officer-reviewed
          drafts with visible sources and human oversight.
        </p>

        <div className="mt-8 grid max-w-lg grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <FeatureTile key={f.label} {...f} />
          ))}
        </div>
      </div>
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

/** Card that tilts subtly toward the cursor, with a spotlight sheen. */
function TiltCard({ children }: { children: ReactNode }) {
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
function MagneticButton({ children }: { children: ReactNode }) {
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
