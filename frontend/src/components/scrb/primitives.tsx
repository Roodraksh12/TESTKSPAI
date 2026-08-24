import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type AccentTone = "default" | "teal" | "amber" | "danger" | "ink";

const accentBorders: Record<AccentTone, string> = {
  default: "",
  teal: "border-l-4 border-l-teal",
  amber: "border-l-4 border-l-amber",
  danger: "border-l-4 border-l-danger",
  ink: "border-l-4 border-l-ink",
};

export function Card({
  children,
  className,
  strong,
  accent,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  accent?: AccentTone;
}) {
  return (
    <div className={cn(
      "bg-surface border border-hairline shadow-sm rounded-2xl",
      strong && "shadow-[0_4px_6px_-1px_rgb(0_0_0_/_0.1),_0_2px_4px_-2px_rgb(0_0_0_/_0.1)]",
      accent && accent !== "default" && accentBorders[accent],
      className
    )}>
      {children}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: AccentTone;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-2xl border border-hairline bg-surface p-4 shadow-sm",
      className
    )}>
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        tone === "teal" ? "bg-teal/10 text-teal" : tone === "amber" ? "bg-amber/10 text-amber" : tone === "danger" ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted-foreground"
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground tracking-tight">{value}</p>
      </div>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("border-t border-hairline", className)} />;
}

export function ActionCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-surface border border-hairline shadow-sm rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
};

export function Button({
  children,
  className,
  variant = "secondary",
  size = "md",
  ...rest
}: BtnProps) {
  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-lg",
    md: "px-4 py-2 text-sm font-medium rounded-lg",
    lg: "px-5 py-3 text-base font-medium rounded-xl",
  }[size];
  const variants = {
    primary:
      "bg-ink text-white font-semibold shadow-sm hover:bg-ink-2",
    secondary: "bg-surface border border-hairline text-foreground hover:bg-muted shadow-sm",
    outline: "bg-transparent border border-hairline text-foreground hover:bg-muted",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg",
  }[variant];
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2",
        sizes,
        variants,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink",
        props.className,
      )}
    />
  );
}

export function Select({
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...rest}
      className={cn(
        "w-full appearance-none rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-foreground transition focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink",
        rest.className,
      )}
    >
      {children}
    </select>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "amber" | "teal" | "danger" | "muted";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface border border-hairline text-foreground shadow-sm",
    amber: "bg-amber/15 border border-amber/40 text-amber font-semibold",
    teal: "bg-teal/15 border border-teal/40 text-teal font-semibold",
    danger: "bg-destructive/15 border border-destructive/40 text-destructive font-semibold",
    muted: "bg-muted border border-hairline text-foreground font-medium",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs",
        tones,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function IconOrb({
  children,
  size = "md",
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "neutral" | "amber" | "teal";
  className?: string;
}) {
  const sizes = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" }[size];
  const tones = {
    neutral: "bg-surface border border-hairline text-foreground shadow-sm",
    amber: "bg-amber/15 border border-amber/40 text-amber",
    teal: "bg-teal/15 border border-teal/40 text-teal",
  }[tone];
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        sizes,
        tones,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="pt-2 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="bg-surface border border-hairline rounded-2xl p-6 space-y-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-8 w-1/3" />
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn(
      "text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase",
      className
    )}>
      {children}
    </h2>
  );
}
