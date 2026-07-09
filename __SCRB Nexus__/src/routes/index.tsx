import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fingerprint, ShieldCheck, ArrowRight, Lock, Sparkles, FileSearch, Radio, Scale } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  GlassButton,
  GlassInput,
  GlassSelect,
} from "@/components/scrb/primitives";
import { SealMark } from "@/components/scrb/insignia";
import { DEMO_CREDENTIALS, useDemoSession } from "@/lib/scrb/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — SCRB Sahayak · Karnataka Police" },
      {
        name: "description",
        content:
          "Secure officer sign-in for SCRB Sahayak, the Karnataka State Crime Records Bureau investigation copilot.",
      },
    ],
  }),
  component: LoginPage,
});

const DISTRICTS = [
  "Bengaluru City",
  "Bengaluru Rural",
  "Mysuru",
  "Mangaluru",
  "Hubballi–Dharwad",
  "Kalaburagi",
];
const STATIONS = ["Cubbon Park", "Indiranagar", "Jayanagar", "Whitefield", "Yelahanka", "Vidhana Soudha"];

const FEATURES = [
  { icon: Sparkles, label: "Source-cited copilot", copy: "Every answer cites the FIR, ledger or MO cluster it drew from." },
  { icon: FileSearch, label: "Entity linkage", copy: "Names, plates and aliases reconciled across cases in seconds." },
  { icon: Radio, label: "Live hotspots", copy: "Beat-level risk maps refreshed hourly for patrol planning." },
  { icon: Scale, label: "Human oversight", copy: "No coercive action on AI alone — confirmation is mandatory." },
];

function LoginPage() {
  const navigate = useNavigate();
  const { session, hydrated, setSession } = useDemoSession();
  const [badgeId, setBadgeId] = useState(DEMO_CREDENTIALS.badgeId);
  const [district, setDistrict] = useState(DEMO_CREDENTIALS.district);
  const [station, setStation] = useState(DEMO_CREDENTIALS.station);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hydrated && session) navigate({ to: "/dashboard" });
  }, [hydrated, session, navigate]);

  const signIn = (usedDemo: boolean) => {
    setSubmitting(true);
    setTimeout(() => {
      setSession({
        badgeId: usedDemo ? DEMO_CREDENTIALS.badgeId : badgeId || "KA-00000",
        officerName: DEMO_CREDENTIALS.officerName,
        district,
        station,
        role: "Investigator",
        language: "EN",
      });
      navigate({ to: "/dashboard" });
    }, 400);
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
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
                  signIn(false);
                }}
                className="mt-6 space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                      District
                    </label>
                    <GlassSelect value={district} onChange={(e) => setDistrict(e.target.value)}>
                      {DISTRICTS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </GlassSelect>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                      Station
                    </label>
                    <GlassSelect value={station} onChange={(e) => setStation(e.target.value)}>
                      {STATIONS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </GlassSelect>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                    Badge ID
                  </label>
                  <div className="relative">
                    <GlassInput
                      value={badgeId}
                      onChange={(e) => setBadgeId(e.target.value)}
                      placeholder="KA-00000"
                      className="text-mono pl-9"
                    />
                    <Fingerprint className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground">
                    Password
                  </label>
                  <div className="relative">
                    <GlassInput
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9"
                    />
                    <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                <div className="pt-2">
                  <MagneticButton>
                    <GlassButton variant="primary" size="lg" className="w-full" disabled={submitting}>
                      {submitting ? "Verifying badge…" : (<>Enter workspace <ArrowRight className="h-4 w-4" /></>)}
                    </GlassButton>
                  </MagneticButton>
                  <button
                    type="button"
                    onClick={() => signIn(true)}
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

          <p className="mt-6 text-center text-[10px] tracking-widest text-muted-foreground uppercase">
            KSP Datathon 2026 · Challenge 01
          </p>
        </div>
      </div>
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
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(15,23,42,0.08) 1px, transparent 1px)",
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
