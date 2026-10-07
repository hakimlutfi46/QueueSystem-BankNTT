import Link from "next/link";
import { HourChart } from "@/app/admin/reports/charts";
import { ReportActions } from "@/app/admin/reports/report-actions";
import { SummaryCards } from "@/app/admin/reports/summary-cards";
import { BrandButton } from "@/components/brand/brand-button";
import { getPrisma } from "@/lib/db";
import { serviceDate } from "@/lib/queue/sql";
import { isIsoDate } from "@/lib/reports/dates";
import { clockLabel, durationLabel, statusLabel } from "@/lib/reports/labels";
import { loadDailyReport } from "@/lib/reports/query";
import type { ReportTotals } from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const requested = (await searchParams).date;
  const today = await serviceDate(getPrisma(), undefined);
  const date = requested && isIsoDate(requested) ? requested : today;
  const report = await loadDailyReport(getPrisma(), date);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Laporan harian</h1>
          <p className="text-ink-muted">Zona waktu {report.timeZone}. Tiket tutup otomatis tidak masuk rata-rata.</p>
        </div>
        <ReportActions href={`/api/reports/export?date=${report.date}`} />
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="font-bold">
          Tanggal
          <input
            type="date"
            name="date"
            defaultValue={report.date}
            required
            className="mt-1 block min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3 font-normal"
          />
        </label>
        <BrandButton type="submit">Tampilkan</BrandButton>
        <Link href={`/admin/reports/range?from=${report.date}&to=${report.date}`} className="font-bold text-brand-blue">
          Rekap rentang
        </Link>
      </form>
      <SummaryCards totals={report.totals} />
      <section>
        <h2 className="mb-3 text-xl font-bold text-brand-navy">Per layanan</h2>
        <TotalsTable
          columns={["Layanan", "Total", "Selesai", "Tidak hadir", "Kedaluwarsa", "Rata-rata tunggu", "Terlama tunggu", "Rata-rata penanganan", "Terlama penanganan"]}
          rows={report.services.map((service) => [service.serviceName, ...totalCells(service)])}
        />
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold text-brand-navy">Per loket dan petugas</h2>
        <TotalsTable
          columns={["Loket", "Petugas", "Total", "Selesai", "Tidak hadir", "Kedaluwarsa", "Rata-rata tunggu", "Rata-rata penanganan"]}
          rows={report.counters.map((counter) => [
            counter.counterName,
            counter.officerName,
            String(counter.total),
            String(counter.done),
            String(counter.noShow),
            String(counter.expired),
            durationLabel(counter.wait.averageSeconds),
            durationLabel(counter.handle.averageSeconds),
          ])}
        />
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold text-brand-navy">Tiket per jam</h2>
        <div className="rounded-[var(--radius-card)] bg-brand-white p-4">
          <HourChart hours={report.hours} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold text-brand-navy">Rincian nomor</h2>
        <TotalsTable
          columns={["Nomor", "Layanan", "Loket", "Petugas", "Jam ambil", "Jam dipanggil", "Jam selesai", "Waktu tunggu", "Lama penanganan", "Panggilan", "Status"]}
          rows={report.tickets.map((ticket) => [
            ticket.number,
            ticket.serviceName,
            ticket.counterName ?? "—",
            ticket.officerName ?? "—",
            clockLabel(ticket.createdAt),
            clockLabel(ticket.calledAt),
            clockLabel(ticket.finishedAt),
            durationLabel(ticket.waitSeconds),
            durationLabel(ticket.handleSeconds),
            String(ticket.callCount),
            statusLabel(ticket.status, ticket.autoClosed),
          ])}
        />
      </section>
    </section>
  );
}

function totalCells(totals: ReportTotals): string[] {
  return [
    String(totals.total),
    String(totals.done),
    String(totals.noShow),
    String(totals.expired),
    durationLabel(totals.wait.averageSeconds),
    durationLabel(totals.wait.maxSeconds),
    durationLabel(totals.handle.averageSeconds),
    durationLabel(totals.handle.maxSeconds),
  ];
}

function TotalsTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] bg-brand-white">
      <table className="w-full text-left text-sm print:text-xs">
        <thead className="text-brand-navy">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-3">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-3 text-ink-muted" colSpan={columns.length}>Belum ada tiket.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.join("|")}>
                {row.map((cell, index) => (
                  <td key={`${columns[index]}-${cell}`} className="px-3 py-3 tabular-nums">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
