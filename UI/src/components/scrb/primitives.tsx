import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GlassPanel({
  children,
  className,
  strong,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <div className={cn(strong ? "glass-strong" : "glass", "rounded-3xl", className)}>
      {children}
    </div>
  );
}

export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "glass rounded-3xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110",
        className,
      )}
    >
      {children}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "glass" | "ghost";
  size?: "sm" | "md" | "lg";
};

export function GlassButton({
  children,
  className,
  variant = "glass",
  size = "md",
  ...rest
}: BtnProps) {
  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-xl",
    md: "px-4 py-2.5 text-sm rounded-2xl",
    lg: "px-5 py-3 text-sm rounded-2xl",
  }[size];
  const variants = {
    primary:
      "bg-ink text-white font-medium hover:brightness-110 shadow-[0_8px_20px_-8px_rgba(15,23,42,0.35)]",
    glass: "bg-surface border border-hairline text-foreground hover:bg-muted",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl",
  }[variant];
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-foreground/20",
        sizes,
        variants,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GlassInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10",
        props.className,
      )}
    />
  );
}

export function GlassSelect({
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...rest}
      className={cn(
        "w-full appearance-none rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm text-foreground transition focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10",
        rest.className,
      )}
    >
      {children}
    </select>
  );
}

export function GlassPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "amber" | "teal" | "danger" | "muted";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface border border-hairline text-foreground",
    amber: "bg-amber/12 border border-amber/30 text-amber-soft",
    teal: "bg-teal/12 border border-teal/25 text-teal-soft",
    danger: "bg-destructive/10 border border-destructive/30 text-destructive",
    muted: "bg-muted border border-hairline text-muted-foreground",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium backdrop-blur",
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
  tone = "glass",
  className,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "glass" | "amber" | "teal";
  className?: string;
}) {
  const sizes = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" }[size];
  const tones = {
    glass: "bg-surface border border-hairline text-foreground",
    amber: "bg-amber/15 border border-amber/30 text-amber-soft",
    teal: "bg-teal/15 border border-teal/25 text-teal-soft",
  }[tone];
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full backdrop-blur-xl",
        sizes,
        tones,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}
