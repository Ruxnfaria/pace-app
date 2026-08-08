import type { HTMLAttributes, ReactNode } from "react";

type CardVariant =
  | "default"
  | "elevated"
  | "hero"
  | "mission"
  | "reward"
  | "success";

type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantStyles: Record<CardVariant, string> = {
  default:
    "border-[#23232f] bg-[#111118]",

  elevated:
    "border-[#2a2938] bg-[#171720] shadow-[0_20px_60px_rgba(0,0,0,0.22)]",

  hero:
    "border-[#7c3aed]/50 bg-gradient-to-br from-[#171026] via-[#100d1b] to-[#0b0b11] shadow-[0_24px_80px_rgba(76,29,149,0.18)]",

  mission:
    "border-[#7c3aed]/40 bg-gradient-to-br from-[#12101a] via-[#0d0d14] to-[#0a0a10] shadow-[0_20px_60px_rgba(76,29,149,0.12)]",

  reward:
    "border-amber-400/30 bg-gradient-to-br from-amber-400/10 via-[#121016] to-[#0b0b11] shadow-[0_20px_60px_rgba(245,158,11,0.12)]",

  success:
    "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-[#101515] to-[#0b0b11] shadow-[0_20px_60px_rgba(16,185,129,0.1)]",
};

const paddingStyles: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 lg:p-6",
  lg: "p-6 lg:p-8",
};

export function Card({
  children,
  variant = "default",
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[28px] border",
        "transition-[border-color,background-color,box-shadow,transform] duration-300",
        variantStyles[variant],
        paddingStyles[padding],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}