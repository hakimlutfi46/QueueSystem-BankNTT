import { StatCard } from "@/components/ui/panel";
import { durationLabel } from "@/lib/reports/labels";
import type { ReportTotals } from "@/lib/reports/types";

export function SummaryCards({ totals }: { totals: ReportTotals }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total tiket" value={totals.total} icon="ticket" />
      <StatCard label="Selesai" value={totals.done} icon="check" tone="success" />
      <StatCard label="Tidak hadir" value={totals.noShow} icon="userX" tone="danger" />
      <StatCard label="Kedaluwarsa" value={totals.expired} icon="calendar" tone="orange" />
      <StatCard
        label="Rata-rata tunggu"
        value={durationLabel(totals.wait.averageSeconds)}
        icon="clock"
        tone="sky"
        hint={`Terlama ${durationLabel(totals.wait.maxSeconds)}`}
      />
      <StatCard label="Terlama tunggu" value={durationLabel(totals.wait.maxSeconds)} icon="clock" tone="orange" />
      <StatCard
        label="Rata-rata penanganan"
        value={durationLabel(totals.handle.averageSeconds)}
        icon="user"
        hint={`Terlama ${durationLabel(totals.handle.maxSeconds)}`}
      />
      <StatCard label="Terlama penanganan" value={durationLabel(totals.handle.maxSeconds)} icon="user" tone="orange" />
    </div>
  );
}
