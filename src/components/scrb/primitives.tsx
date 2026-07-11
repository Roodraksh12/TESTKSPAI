import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-surface border border-hairline shadow-sm rounded-xl", className)}>
      {children}
    </div>
  );
}

export function ActionCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-surface border border-hairline shadow-sm rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
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

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase border-b border-hairline pb-2 mb-4">
      {children}
    </h2>
  );
}
