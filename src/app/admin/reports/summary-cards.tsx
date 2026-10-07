import { durationLabel } from "@/lib/reports/labels";
import type { ReportTotals } from "@/lib/reports/types";

export function SummaryCards({ totals }: { totals: ReportTotals }) {
  const cards = [
    ["Total tiket", String(totals.total)],
    ["Selesai", String(totals.done)],
    ["Tidak hadir", String(totals.noShow)],
    ["Kedaluwarsa", String(totals.expired)],
    ["Rata-rata tunggu", durationLabel(totals.wait.averageSeconds)],
    ["Terlama tunggu", durationLabel(totals.wait.maxSeconds)],
    ["Rata-rata penanganan", durationLabel(totals.handle.averageSeconds)],
    ["Terlama penanganan", durationLabel(totals.handle.maxSeconds)],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <article key={label} className="rounded-[var(--radius-card)] bg-brand-white p-4">
          <p className="text-ink-muted">{label}</p>
          <p className="text-3xl font-bold text-brand-navy tabular-nums">{value}</p>
        </article>
      ))}
    </div>
  );
}
