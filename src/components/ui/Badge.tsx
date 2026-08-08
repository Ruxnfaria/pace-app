import type { HTMLAttributes, ReactNode } from "react";

type BadgeVariant =
  | "default"
  | "xp"
  | "success"
  | "daily"
  | "weekly"
  | "monthly"
  | "league"
  | "warning"
  | "epic";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "border-zinc-700 bg-zinc-800/60 text-zinc-300",

  xp:
    "border-[#7c3aed]/25 bg-[#7c3aed]/10 text-[#b58cff]",

  success:
    "border-green-500/25 bg-green-500/10 text-green-400",

  daily:
    "border-green-500/20 bg-green-500/10 text-green-400",

  weekly:
    "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",

  monthly:
    "border-blue-500/20 bg-blue-500/10 text-blue-400",

  league:
    "border-slate-300/30 bg-slate-300/10 text-slate-200",

  warning:
    "border-yellow-400/25 bg-yellow-400/10 text-yellow-300",

  epic:
    "border-purple-400/30 bg-purple-500/15 text-purple-300",
};

export function Badge({
  children,
  variant = "default",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full border",
        "px-2.5 py-1 text-[10px] font-black uppercase tracking-wide",
        "whitespace-nowrap transition-colors",
        variantStyles[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}