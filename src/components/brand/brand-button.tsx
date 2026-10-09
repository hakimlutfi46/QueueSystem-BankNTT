import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-brand-navy text-brand-white shadow-card hover:bg-brand-blue",
  secondary: "bg-brand-blue text-brand-white hover:bg-brand-navy",
  outline: "border border-line bg-brand-white text-brand-navy hover:border-brand-blue hover:bg-navy-soft",
  ghost: "text-brand-navy hover:bg-navy-soft",
  danger: "border border-line bg-brand-white text-danger hover:border-danger hover:bg-danger-soft",
  accent: "bg-brand-orange text-ink hover:brightness-95",
} as const;

const sizes = {
  sm: "min-h-9 gap-1.5 px-3 text-sm",
  md: "min-h-12 gap-2 px-5 text-base",
  lg: "min-h-16 gap-3 px-6 text-xl",
  touch: "min-h-40 gap-2 px-8 text-[40px]",
} as const;

type BrandButtonProps = {
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
};

export function BrandButton({
  children,
  variant = "primary",
  size = "md",
  className,
  href,
  type = "button",
  disabled = false,
  onClick,
  title,
  ariaLabel,
}: BrandButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-[var(--radius-card)] font-bold transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-sky disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes} title={title} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
