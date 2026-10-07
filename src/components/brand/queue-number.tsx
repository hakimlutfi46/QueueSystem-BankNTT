import { cn } from "@/lib/cn";

const sizes = {
  tv: "text-[220px]",
  kiosk: "text-[140px]",
  counter: "text-[96px]",
  inline: "text-5xl",
} as const;

const tones = {
  navy: "text-brand-navy",
  orange: "text-brand-orange",
  white: "text-brand-white",
} as const;

export function QueueNumber({
  value,
  size = "counter",
  tone = "navy",
  className,
}: {
  value: string;
  size?: keyof typeof sizes;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-bold leading-none tabular-nums",
        sizes[size],
        tones[tone],
        className,
      )}
    >
      {value}
    </p>
  );
}
