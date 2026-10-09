import Link from "next/link";
import { RangeChart } from "@/app/admin/reports/charts";
import { ReportActions } from "@/app/admin/reports/report-actions";
import { SummaryCards } from "@/app/admin/reports/summary-cards";
import { ReportTabs } from "@/app/admin/reports/report-tabs";
import { BrandButton } from "@/components/brand/brand-button";
import { inputClass } from "@/components/ui/field";
import { Alert, PageHeader, Panel } from "@/components/ui/panel";
import { AdminError } from "@/lib/admin/errors";
import { getPrisma } from "@/lib/db";
import { serviceDate } from "@/lib/queue/sql";
import { isIsoDate } from "@/lib/reports/dates";
import { durationLabel } from "@/lib/reports/labels";
import { loadRangeReport } from "@/lib/reports/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RangeReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = await serviceDate(getPrisma(), undefined);
  const from = params.from && isIsoDate(params.from) ? params.from : today;
  const to = params.to && isIsoDate(params.to) ? params.to : today;

  let report: Awaited<ReturnType<typeof loadRangeReport>> | null = null;
  let error: string | null = null;
  try {
    report = await loadRangeReport(getPrisma(), from, to);
  } catch (caught) {
    error = caught instanceof AdminError ? caught.message : "Laporan gagal dibuat.";
  }

  const presets = [
    { label: "7 hari", from: shiftDate(today, -6) },
    { label: "30 hari", from: shiftDate(today, -29) },
    { label: "Bulan ini", from: `${today.slice(0, 8)}01` },
  ];

  return (
    <section className="flex flex-col gap-6">
      <div>
        <ReportTabs active="range" />
        <PageHeader
          title="Rekap rentang tanggal"
          description="Satu baris per hari. Rata-rata dihitung dari seluruh tiket, bukan rata-rata dari rata-rata harian."
          actions={report ? <ReportActions href={`/api/reports/export?from=${report.from}&to=${report.to}`} /> : null}
        />
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-brand-white p-4 shadow-card print:hidden">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Dari
          <input type="date" name="from" defaultValue={from} max={today} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Sampai
          <input type="date" name="to" defaultValue={to} max={today} required className={inputClass} />
        </label>
        <BrandButton type="submit">Tampilkan</BrandButton>
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <BrandButton key={preset.label} href={`?from=${preset.from}&to=${today}`} variant="ghost" size="sm">
              {preset.label}
            </BrandButton>
          ))}
        </div>
        <Link href={`/admin/reports/daily?date=${from}`} className="ml-auto self-center font-bold text-brand-blue">Laporan harian</Link>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {report ? (
        <>
          <SummaryCards totals={report.totals} />
          <Panel title="Rata-rata per hari" description="Dalam detik. Garis yang naik menandakan hari dengan antrean lebih lama.">
            <RangeChart days={report.days} />
          </Panel>
          <Panel title="Rincian per hari" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm print:text-xs">
                <thead className="bg-surface text-ink-muted">
                  <tr>
                    {["Tanggal", "Total", "Selesai", "Tidak hadir", "Kedaluwarsa", "Rata-rata tunggu", "Terlama tunggu", "Rata-rata penanganan", "Terlama penanganan"].map((column) => (
                      <th key={column} className="whitespace-nowrap px-4 py-3 font-bold">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((day) => (
                    <tr key={day.date} className="border-t border-line hover:bg-surface/60">
                      <td className="px-4 py-3 font-bold">
                        <Link href={`/admin/reports/daily?date=${day.date}`} className="text-brand-navy hover:underline">{day.date}</Link>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{day.total}</td>
                      <td className="px-4 py-3 tabular-nums">{day.done}</td>
                      <td className="px-4 py-3 tabular-nums">{day.noShow}</td>
                      <td className="px-4 py-3 tabular-nums">{day.expired}</td>
                      <td className="px-4 py-3 tabular-nums">{durationLabel(day.wait.averageSeconds)}</td>
                      <td className="px-4 py-3 tabular-nums">{durationLabel(day.wait.maxSeconds)}</td>
                      <td className="px-4 py-3 tabular-nums">{durationLabel(day.handle.averageSeconds)}</td>
                      <td className="px-4 py-3 tabular-nums">{durationLabel(day.handle.maxSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}
    </section>
  );
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
