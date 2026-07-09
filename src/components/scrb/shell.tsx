"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  MessageSquare,
  BarChart2,
  Share2,
  Map as MapIcon,
  FileUp,
  Settings as SettingsIcon,
  LogOut,
  Search,
  Bell,
} from "lucide-react";
import { SealMark } from "./insignia";
import { cn } from "@/lib/utils";

const DOCK = [
  { to: "/dashboard", label: "Copilot", icon: MessageSquare },
  { to: "/analytics", label: "Analytics", icon: BarChart2 },
  { to: "/network", label: "Network", icon: Share2 },
  { to: "/hotspots", label: "Hotspots", icon: MapIcon },
  { to: "/fir/upload", label: "FIR Intake", icon: FileUp },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function TopNav() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="fixed top-0 right-0 left-0 z-40 border-b border-hairline bg-background/85 backdrop-blur-xl">
      <div className="flex w-full items-center justify-between px-6 py-3">
        {/* Left: Branding */}
        <div className="flex flex-1 items-center justify-start">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white">
              <SealMark size={22} />
            </div>
            <div className="hidden flex-col justify-center md:flex">
              <span className="text-[15px] font-bold leading-none tracking-tight">SCRB Sahayak</span>
              <span className="mt-1 text-[10px] font-medium leading-none tracking-widest text-muted-foreground uppercase">
                Karnataka Police
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Search */}
        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="flex w-full max-w-[480px] items-center gap-2 rounded-full border border-hairline bg-white px-3 py-1.5 shadow-sm transition-colors focus-within:border-foreground/30">
            <Search className="h-4 w-4 text-muted-foreground ml-1" />
            <input
              placeholder="Search cases, entities, hotspots..."
              className="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            />
            <div className="flex items-center justify-center rounded-[4px] border border-hairline bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground mr-1">
              ⌘ K
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <button
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-white text-muted-foreground hover:text-foreground transition-colors shadow-sm"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-amber-500 border border-white"></span>
          </button>

          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            aria-label="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-white text-muted-foreground hover:bg-danger/10 hover:text-danger hover:border-danger/20 transition-colors shadow-sm"
          >
            <LogOut className="h-4 w-4 ml-0.5" />
          </button>
          
          {/* Profile with Badge ID */}
          <div className="flex h-9 items-center gap-2 rounded-full border border-hairline bg-white pr-3 pl-1 shadow-sm">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-[11px] font-semibold text-amber-600">
              {(session?.user?.name ?? "IN").slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden flex-col justify-center sm:flex">
              <span className="text-[11px] font-medium leading-tight text-foreground">
                {session?.user?.badgeId || "KA-14827"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function Dock() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 md:hidden">
      <div className="glass-strong flex items-center gap-1 rounded-full px-2 py-2">
        {DOCK.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              href={to}
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

export function LeftRail() {
  const pathname = usePathname();
  const activeIndex = DOCK.findIndex(
    ({ to }) => pathname === to || pathname.startsWith(to + "/"),
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const ITEM = 44; // 40 icon + 4 gap
  const indicatorIndex = hoverIndex ?? (activeIndex >= 0 ? activeIndex : 0);
  const showHover = hoverIndex !== null && hoverIndex !== activeIndex;

  return (
    <aside
      className="fixed top-20 bottom-6 left-4 z-30 hidden w-14 flex-col items-center overflow-hidden rounded-[28px] border border-hairline bg-surface/80 backdrop-blur-xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.1)] py-4 md:flex"
    >
      <nav
        className="relative flex w-full flex-1 flex-col items-center gap-1"
        onMouseLeave={() => setHoverIndex(null)}
      >
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
              href={to}
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
