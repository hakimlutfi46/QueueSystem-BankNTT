import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function BrandCard({
  children,
  active = false,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-[var(--radius-card)] bg-brand-white p-6 text-ink",
        active
          ? "shadow-glow"
          : "shadow-card",
        className,
      )}
    >
      {children}
    </article>
  );
}
