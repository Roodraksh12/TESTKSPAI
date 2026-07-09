import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  MessageSquare,
  FolderOpen,
  Share2,
  Map as MapIcon,
  FileUp,
  Settings as SettingsIcon,
  LogOut,
  Search,
  Bell,
  Command,
} from "lucide-react";
import { SealMark } from "./insignia";
import { useDemoSession } from "@/lib/scrb/session";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const DOCK = [
  { to: "/dashboard", label: "Copilot", icon: MessageSquare },
  { to: "/cases", label: "Cases", icon: FolderOpen },
  { to: "/network", label: "Network", icon: Share2 },
  { to: "/hotspots", label: "Hotspots", icon: MapIcon },
  { to: "/fir-upload", label: "FIR Intake", icon: FileUp },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function TopNav() {
  const { session, setSession } = useDemoSession();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="fixed top-0 right-0 left-0 z-40 border-b border-hairline bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white">
              <SealMark size={22} />
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight">SCRB Sahayak</p>
              <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Karnataka Police
              </p>
            </div>
          </Link>

          <button
            onClick={() => setPaletteOpen(true)}
            className="mx-auto hidden w-full max-w-lg items-center gap-3 rounded-full border border-hairline bg-surface-2 px-4 py-2 text-left text-sm text-muted-foreground transition hover:border-ink/20 hover:bg-surface md:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1">Search cases, entities, hotspots…</span>
            <kbd className="text-mono flex items-center gap-1 rounded border border-hairline bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface text-muted-foreground hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-amber" />
            </button>
            <button
              onClick={() => {
                setSession(null);
                navigate({ to: "/" });
              }}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <div className="ml-1 flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface pr-3 pl-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber/15 text-[11px] font-semibold text-amber-soft">
                {(session?.officerName ?? "SI").slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {session?.badgeId ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-32 backdrop-blur-sm"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                placeholder="Type a command or search…"
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              <kbd className="text-mono rounded border border-hairline px-1.5 py-0.5 text-[10px] text-muted-foreground">
                ESC
              </kbd>
            </div>
            <div className="max-h-80 overflow-auto p-2">
              <p className="px-2 pt-2 pb-1 text-[10px] tracking-wider text-muted-foreground uppercase">
                Navigate
              </p>
              {DOCK.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setPaletteOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-surface-2"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function LeftRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = DOCK.findIndex(
    ({ to }) => pathname === to || pathname.startsWith(to + "/"),
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const ITEM = 44; // 40 icon + 4 gap
  const indicatorIndex = hoverIndex ?? (activeIndex >= 0 ? activeIndex : 0);
  const showHover = hoverIndex !== null && hoverIndex !== activeIndex;

  return (
    <aside
      className="fixed top-16 bottom-4 left-4 z-30 hidden w-14 flex-col items-center overflow-hidden rounded-2xl border border-white/50 py-3 md:flex"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.32))",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(255,255,255,0.35), 0 20px 50px -22px rgba(15,23,42,0.28)",
      }}
    >
      <nav
        className="relative flex w-full flex-1 flex-col items-center gap-1"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Sliding indicator — drags between items, centered in the rail */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 h-10 w-10 rounded-xl"
          style={{
            transform: `translate(-50%, ${indicatorIndex * ITEM}px)`,
            transition:
              "transform 380ms cubic-bezier(0.34, 1.4, 0.5, 1), background-color 200ms",
            background: showHover
              ? "color-mix(in oklab, var(--ink) 8%, transparent)"
              : "var(--ink)",
          }}
        />
        {/* Amber active tick — follows the real active route */}
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 h-5 w-1 rounded-r-full bg-amber"
            style={{
              top: 10,
              transform: `translateY(${activeIndex * ITEM}px)`,
              transition: "transform 380ms cubic-bezier(0.34, 1.4, 0.5, 1)",
            }}
          />
        )}

        {DOCK.map(({ to, label, icon: Icon }, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              title={label}
              onMouseEnter={() => setHoverIndex(i)}
              className={cn(
                "group relative z-10 flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                active
                  ? hoverIndex === null || hoverIndex === i
                    ? "text-white"
                    : "text-foreground"
                  : hoverIndex === i
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              <Icon className="h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110" />
              <span className="text-mono pointer-events-none absolute left-12 z-20 rounded-md border border-hairline bg-surface/90 px-2 py-1 text-[10px] whitespace-nowrap text-foreground opacity-0 shadow-md backdrop-blur-md transition group-hover:opacity-100">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="text-mono mt-2 rotate-180 text-[9px] tracking-widest text-muted-foreground [writing-mode:vertical-rl]">
        KSP · SCRB
      </div>
    </aside>
  );
}

export function Dock() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 md:hidden">
      <div className="glass-strong flex items-center gap-1 rounded-full px-2 py-2">
        {DOCK.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                active
                  ? "bg-ink text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4.5 w-4.5" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
