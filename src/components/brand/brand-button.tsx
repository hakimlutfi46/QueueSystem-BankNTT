import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-brand-navy text-brand-white hover:bg-brand-blue",
  secondary: "bg-brand-blue text-brand-white hover:bg-brand-navy",
} as const;

const sizes = {
  md: "min-h-12 px-5 text-base",
  touch: "min-h-40 px-8 text-[40px]",
} as const;

type BrandButtonProps = {
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  href?: string;
  type?: "button" | "submit";
};

export function BrandButton({
  children,
  variant = "primary",
  size = "md",
  className,
  href,
  type = "button",
}: BrandButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-[var(--radius-card)] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-sky",
    variants[variant],
    sizes[size],
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={classes}>
      {children}
    </button>
  );
}
