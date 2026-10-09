import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  navy: "bg-navy-soft text-brand-navy",
  sky: "bg-sky-soft text-brand-navy",
  orange: "bg-orange-soft text-ink",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface text-ink-muted",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  children,
  tone = "navy",
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const COUNTER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  OPEN: { label: "Buka", tone: "success" },
  PAUSED: { label: "Istirahat", tone: "orange" },
  CLOSED: { label: "Tutup", tone: "muted" },
};

export function CounterStatusBadge({ status, inactive = false }: { status: string; inactive?: boolean }) {
  if (inactive) return <Badge tone="danger" dot>Nonaktif</Badge>;
  const view = COUNTER_STATUS[status] ?? COUNTER_STATUS.CLOSED;
  return (
    <Badge tone={view.tone} dot>
      {view.label}
    </Badge>
  );
}

/** Kotak huruf awalan layanan, misalnya A atau B. */
export function PrefixTile({
  prefix,
  className,
  tone = "navy",
}: {
  prefix: string;
  className?: string;
  tone?: "navy" | "white";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-bold tabular-nums",
        tone === "navy" ? "bg-brand-navy text-brand-white" : "bg-brand-white text-brand-navy",
        className ?? "size-10 text-lg",
      )}
      aria-hidden="true"
    >
      {prefix}
    </span>
  );
}
