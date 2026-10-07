import Link from "next/link";
import { RangeChart } from "@/app/admin/reports/charts";
import { ReportActions } from "@/app/admin/reports/report-actions";
import { SummaryCards } from "@/app/admin/reports/summary-cards";
import { BrandButton } from "@/components/brand/brand-button";
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

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Rekap rentang tanggal</h1>
          <p className="text-ink-muted">Satu baris per hari. Rata-rata dihitung dari seluruh tiket, bukan rata-rata dari rata-rata harian.</p>
        </div>
        {report ? <ReportActions href={`/api/reports/export?from=${report.from}&to=${report.to}`} /> : null}
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="font-bold">
          Dari
          <input type="date" name="from" defaultValue={from} required className="mt-1 block min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3 font-normal" />
        </label>
        <label className="font-bold">
          Sampai
          <input type="date" name="to" defaultValue={to} required className="mt-1 block min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3 font-normal" />
        </label>
        <BrandButton type="submit">Tampilkan</BrandButton>
        <Link href={`/admin/reports/daily?date=${from}`} className="font-bold text-brand-blue">Laporan harian</Link>
      </form>
      {error ? <p role="alert" className="font-bold text-danger">{error}</p> : null}
      {report ? (
        <>
          <SummaryCards totals={report.totals} />
          <section>
            <h2 className="mb-3 text-xl font-bold text-brand-navy">Rata-rata per hari</h2>
            <div className="rounded-[var(--radius-card)] bg-brand-white p-4">
              <RangeChart days={report.days} />
            </div>
          </section>
          <div className="overflow-x-auto rounded-[var(--radius-card)] bg-brand-white">
            <table className="w-full text-left text-sm print:text-xs">
              <thead className="text-brand-navy">
                <tr>
                  {["Tanggal", "Total", "Selesai", "Tidak hadir", "Kedaluwarsa", "Rata-rata tunggu", "Terlama tunggu", "Rata-rata penanganan", "Terlama penanganan"].map((column) => (
                    <th key={column} className="px-3 py-3">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => (
                  <tr key={day.date}>
                    <td className="px-3 py-3 font-bold">{day.date}</td>
                    <td className="px-3 py-3 tabular-nums">{day.total}</td>
                    <td className="px-3 py-3 tabular-nums">{day.done}</td>
                    <td className="px-3 py-3 tabular-nums">{day.noShow}</td>
                    <td className="px-3 py-3 tabular-nums">{day.expired}</td>
                    <td className="px-3 py-3 tabular-nums">{durationLabel(day.wait.averageSeconds)}</td>
                    <td className="px-3 py-3 tabular-nums">{durationLabel(day.wait.maxSeconds)}</td>
                    <td className="px-3 py-3 tabular-nums">{durationLabel(day.handle.averageSeconds)}</td>
                    <td className="px-3 py-3 tabular-nums">{durationLabel(day.handle.maxSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
