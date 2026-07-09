"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 h-16 bg-[var(--canvas)] border-b border-[var(--border-light)] text-[var(--ink)]">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-[var(--primary)] text-[var(--on-primary)] rounded-[4px] flex items-center justify-center font-bold text-lg font-serif">
          S
        </div>
        <span className="font-semibold text-[15px] tracking-tight">SCRB Sahayak</span>
      </div>

      {/* Utilities */}
      <div className="flex items-center gap-4">
        {session?.user && (
          <div className="text-right hidden sm:block text-[14px]">
            <p className="font-medium text-[var(--ink)]">{session.user.name}</p>
            <p className="text-[var(--muted)] text-[12px]">
              {session.user.badgeId} • {session.user.role}
            </p>
          </div>
        )}
        <div className="w-[1px] h-6 bg-[var(--border-light)] mx-2 hidden sm:block" />
        
        <Button variant="ghost" size="icon" className="text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--soft-stone)] rounded-[4px] h-9 w-9">
          <Bell className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--soft-stone)] rounded-[4px] h-9 w-9">
          <Search className="w-4 h-4" />
        </Button>
        <div className="w-[1px] h-6 bg-[var(--border-light)] mx-2" />
        <Button variant="ghost" className="gap-2 text-[14px] font-medium text-[var(--ink)] hover:bg-[var(--soft-stone)] rounded-[4px] px-3 h-9" onClick={() => signOut()}>
          <LogOut className="w-4 h-4 text-[var(--muted)]" />
          Sign Out
        </Button>
      </div>
    </header>
  );
}
