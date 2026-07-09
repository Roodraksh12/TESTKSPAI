"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FolderOpen, Map, Network, Settings, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/fir/upload", icon: FileText, label: "Upload FIR" },
  { href: "/network", icon: Network, label: "Network" },
  { href: "/hotspots", icon: Map, label: "Hotspots" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="w-16 bg-[var(--canvas)] border-r border-[var(--border-light)] flex flex-col items-center py-6 gap-4 shrink-0 z-50 relative h-[calc(100vh-4rem)]">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "p-3 rounded-[8px] transition-colors relative group",
              isActive 
                ? "text-[var(--on-primary)] bg-[var(--primary)]" 
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--soft-stone)]"
            )}
          >
            <div className="relative z-10">
              <Icon className="w-5 h-5" />
            </div>
            
            <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-[var(--primary)] border border-[var(--primary)] text-[var(--on-primary)] font-medium text-[12px] px-3 py-1.5 rounded-[4px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 translate-x-2 group-hover:translate-x-0">
              {item.label}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
