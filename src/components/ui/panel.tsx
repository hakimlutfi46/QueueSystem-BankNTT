"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-line bg-brand-white shadow-card", className)}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-brand-navy">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const statTones = {
  navy: "bg-navy-soft text-brand-navy",
  sky: "bg-sky-soft text-brand-blue",
  orange: "bg-orange-soft text-ink",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
} as const;

export function StatCard({
  label,
  value,
  icon,
  tone = "navy",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  tone?: keyof typeof statTones;
  hint?: ReactNode;
}) {
  return (
    <article className="flex items-start gap-4 rounded-[var(--radius-card)] border border-line bg-brand-white p-4 shadow-card">
      <span className={cn("flex size-11 items-center justify-center rounded-xl", statTones[tone])}>
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="text-2xl font-bold text-brand-navy tabular-nums sm:text-3xl">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
    </article>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-brand-white px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-navy-soft text-brand-navy">
        <Icon name={icon} className="size-6" />
      </span>
      <p className="font-bold text-brand-navy">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "success" }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-center gap-2 rounded-xl px-4 py-3 font-bold",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
      )}
    >
      <Icon name={tone === "danger" ? "close" : "check"} className="size-4" />
      {children}
    </p>
  );
}

/** Dialog modal sederhana: Escape dan klik latar menutup, fokus pindah ke dalam saat dibuka. */
export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = dialog.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Tutup"
        tabIndex={-1}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-fade-up relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[var(--radius-card)] bg-brand-white shadow-card sm:rounded-[var(--radius-card)]",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-brand-white px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-brand-navy">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Tutup dialog"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
