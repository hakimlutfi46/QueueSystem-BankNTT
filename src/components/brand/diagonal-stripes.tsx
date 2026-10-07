import { cn } from "@/lib/cn";

const BANDS = [
  "bg-brand-navy",
  "bg-brand-blue",
  "bg-brand-sky",
  "bg-brand-orange",
  "bg-brand-grey",
] as const;

export function DiagonalStripes({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-3 overflow-hidden", className)} aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-full w-14 shrink-0 -skew-x-[25deg]",
            BANDS[index % BANDS.length],
          )}
        />
      ))}
    </div>
  );
}
