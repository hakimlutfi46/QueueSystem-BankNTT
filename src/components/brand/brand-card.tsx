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
          ? "shadow-[0_0_0_2px_var(--brand-sky),0_0_36px_var(--brand-sky)]"
          : "shadow-[0_10px_24px_-18px_var(--ink)]",
        className,
      )}
    >
      {children}
    </article>
  );
}
