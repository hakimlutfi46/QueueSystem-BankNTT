import Link from "next/link";
import type { ReactNode } from "react";
import { HourChart } from "@/app/admin/reports/charts";
import { ReportActions } from "@/app/admin/reports/report-actions";
import { ReportTabs } from "@/app/admin/reports/report-tabs";
import { SummaryCards } from "@/app/admin/reports/summary-cards";
import { BrandButton } from "@/components/brand/brand-button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { PageHeader, Panel } from "@/components/ui/panel";
import { getPrisma } from "@/lib/db";
import { serviceDate } from "@/lib/queue/sql";
import { isIsoDate } from "@/lib/reports/dates";
import { clockLabel, durationLabel, statusLabel } from "@/lib/reports/labels";
import { loadDailyReport } from "@/lib/reports/query";
import type { ReportTotals } from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, BadgeTone> = {
  WAITING: "orange",
  SERVING: "sky",
  DONE: "success",
  NO_SHOW: "danger",
  EXPIRED: "muted",
};

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
      <div>
        <ReportTabs active="daily" />
        <PageHeader
          title="Laporan harian"
          description={`${longDate(report.date)} · zona waktu ${report.timeZone}. Tiket tutup otomatis tidak masuk rata-rata.`}
          actions={<ReportActions href={`/api/reports/export?date=${report.date}`} />}
        />
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-brand-white p-4 shadow-card print:hidden">
        <BrandButton href={`?date=${shiftDate(report.date, -1)}`} variant="outline" ariaLabel="Hari sebelumnya">
          ‹
        </BrandButton>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Tanggal
          <input type="date" name="date" defaultValue={report.date} max={today} required className={inputClass} />
        </label>
        {report.date < today ? (
          <BrandButton href={`?date=${shiftDate(report.date, 1)}`} variant="outline" ariaLabel="Hari berikutnya">
            ›
          </BrandButton>
        ) : null}
        <BrandButton type="submit">Tampilkan</BrandButton>
        {report.date !== today ? (
          <BrandButton href="?" variant="ghost">
            Hari ini
          </BrandButton>
        ) : null}
        <Link href={`/admin/reports/range?from=${report.date}&to=${report.date}`} className="ml-auto self-center font-bold text-brand-blue">
          Rekap rentang
        </Link>
      </form>
      <SummaryCards totals={report.totals} />
      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel title="Per layanan" bodyClassName="p-0">
          <TotalsTable
            columns={["Layanan", "Total", "Selesai", "Tidak hadir", "Kedaluwarsa", "Rata-rata tunggu", "Terlama tunggu", "Rata-rata penanganan", "Terlama penanganan"]}
            rows={report.services.map((service) => [service.serviceName, ...totalCells(service)])}
          />
        </Panel>
        <Panel title="Per loket dan petugas" bodyClassName="p-0">
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
        </Panel>
      </div>
      <Panel title="Tiket per jam" description="Jam sibuk membantu menentukan kapan loket tambahan perlu dibuka.">
        <HourChart hours={report.hours} />
      </Panel>
      <Panel title="Rincian nomor" description={`${report.tickets.length} tiket. Tiket bisa dicetak ulang bila printer kiosk gagal.`} bodyClassName="p-0">
        <TotalsTable
          columns={["Nomor", "Layanan", "Loket", "Petugas", "Jam ambil", "Jam dipanggil", "Jam selesai", "Waktu tunggu", "Lama penanganan", "Panggilan", "Status", "Cetak"]}
          rows={report.tickets.map((ticket) => [
            <span key="number" className="font-bold text-brand-navy">{ticket.number}</span>,
            ticket.serviceName,
            ticket.counterName ?? "—",
            ticket.officerName ?? "—",
            clockLabel(ticket.createdAt),
            clockLabel(ticket.calledAt),
            clockLabel(ticket.finishedAt),
            durationLabel(ticket.waitSeconds),
            durationLabel(ticket.handleSeconds),
            String(ticket.callCount),
            <Badge key="status" tone={STATUS_TONES[ticket.status] ?? "muted"}>{statusLabel(ticket.status, ticket.autoClosed)}</Badge>,
            <a
              key="print"
              href={`/print/${ticket.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-brand-blue print:hidden"
              aria-label={`Cetak ulang ${ticket.number}`}
            >
              <Icon name="printer" className="size-4" />
              Ulang
            </a>,
          ])}
          keyOf={(index) => report.tickets[index]?.id ?? String(index)}
        />
      </Panel>
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

function TotalsTable({
  columns,
  rows,
  keyOf,
}: {
  columns: string[];
  rows: ReactNode[][];
  keyOf?: (index: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm print:text-xs">
        <thead className="bg-surface text-ink-muted">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-4 py-3 font-bold">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-center text-ink-muted" colSpan={columns.length}>Belum ada tiket.</td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={keyOf ? keyOf(rowIndex) : row.map(String).join("|")} className="border-t border-line hover:bg-surface/60">
                {row.map((cell, index) => (
                  <td key={columns[index]} className="whitespace-nowrap px-4 py-3 tabular-nums">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
