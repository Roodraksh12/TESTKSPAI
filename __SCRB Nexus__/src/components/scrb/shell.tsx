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
} from "lucide-react";
import { SealMark } from "./insignia";
import { useDemoSession } from "@/lib/scrb/session";
import { cn } from "@/lib/utils";

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="fixed top-0 right-0 left-0 z-40 border-b border-hairline bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
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

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {DOCK.slice(0, 5).map(({ to, label }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "relative rounded-full px-3.5 py-1.5 text-sm transition",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-foreground" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 md:flex">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search FIRs, entities, hotspots…"
              className="w-56 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <button
            aria-label="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface text-muted-foreground hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
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
