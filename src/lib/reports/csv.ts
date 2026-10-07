import { durationLabel, statusLabel } from "@/lib/reports/labels";
import type { DailyReport, RangeReport, ReportFile, ReportTotals } from "@/lib/reports/types";

export function dailyCsv(report: DailyReport): ReportFile {
  const lines = [
    ["Laporan harian", report.date],
    [],
    ["Ringkasan"],
    totalsHeader(),
    totalsRow("Hari ini", report.totals),
    [],
    ["Per layanan"],
    ["Layanan", ...totalsHeader().slice(1)],
    ...report.services.map((service) => [service.serviceName, ...totalsRow("", service).slice(1)]),
    [],
    ["Per loket"],
    ["Loket", "Petugas", ...totalsHeader().slice(1)],
    ...report.counters.map((counter) => [counter.counterName, counter.officerName, ...totalsRow("", counter).slice(1)]),
    [],
    ["Per jam"],
    ["Jam", "Jumlah tiket"],
    ...report.hours.map((bucket) => [String(bucket.hour).padStart(2, "0"), bucket.count]),
    [],
    ["Rincian"],
    detailHeader(),
    ...report.tickets.map((ticket) => [
      ticket.number,
      ticket.serviceName,
      ticket.counterName ?? "",
      ticket.officerName ?? "",
      ticket.createdAt,
      ticket.calledAt ?? "",
      ticket.finishedAt ?? "",
      durationLabel(ticket.waitSeconds),
      ticket.waitSeconds ?? "",
      durationLabel(ticket.handleSeconds),
      ticket.handleSeconds ?? "",
      ticket.callCount,
      statusLabel(ticket.status, ticket.autoClosed),
    ]),
  ];
  return file(`laporan-harian-${report.date}.csv`, "text/csv; charset=utf-8", lines);
}

export function rangeCsv(report: RangeReport): ReportFile {
  const lines = [
    ["Rekap", report.from, report.to],
    [],
    ["Ringkasan"],
    totalsHeader(),
    totalsRow("Rentang", report.totals),
    [],
    ["Per hari"],
    ["Tanggal", ...totalsHeader().slice(1)],
    ...report.days.map((day) => [day.date, ...totalsRow("", day).slice(1)]),
  ];
  return file(`rekap-${report.from}-${report.to}.csv`, "text/csv; charset=utf-8", lines);
}

function totalsHeader(): string[] {
  return [
    "Kelompok",
    "Total tiket",
    "Selesai",
    "Tidak hadir",
    "Kedaluwarsa",
    "Rata-rata tunggu",
    "Rata-rata tunggu (detik)",
    "Terlama tunggu",
    "Terlama tunggu (detik)",
    "Rata-rata penanganan",
    "Rata-rata penanganan (detik)",
    "Terlama penanganan",
    "Terlama penanganan (detik)",
  ];
}

function totalsRow(label: string, totals: ReportTotals): Array<string | number> {
  return [
    label,
    totals.total,
    totals.done,
    totals.noShow,
    totals.expired,
    durationLabel(totals.wait.averageSeconds),
    totals.wait.averageSeconds ?? "",
    durationLabel(totals.wait.maxSeconds),
    totals.wait.maxSeconds ?? "",
    durationLabel(totals.handle.averageSeconds),
    totals.handle.averageSeconds ?? "",
    durationLabel(totals.handle.maxSeconds),
    totals.handle.maxSeconds ?? "",
  ];
}

function detailHeader(): string[] {
  return [
    "Nomor",
    "Layanan",
    "Loket",
    "Petugas",
    "Jam ambil",
    "Jam dipanggil",
    "Jam selesai",
    "Waktu tunggu",
    "Waktu tunggu (detik)",
    "Lama penanganan",
    "Lama penanganan (detik)",
    "Jumlah panggilan",
    "Status",
  ];
}

function file(filename: string, contentType: string, rows: Array<Array<string | number>>): ReportFile {
  const csv = rows.map((row) => row.map(cell).join(",")).join("\r\n");
  return { filename, contentType, body: Buffer.from(`\uFEFF${csv}`, "utf8") };
}

function cell(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
