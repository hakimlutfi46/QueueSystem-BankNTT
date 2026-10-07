import ExcelJS from "exceljs";
import { durationLabel, statusLabel } from "@/lib/reports/labels";
import type { DailyReport, RangeReport, ReportFile, ReportTotals } from "@/lib/reports/types";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function dailyWorkbook(report: DailyReport): Promise<ReportFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Antrian Bank NTT";
  addTotalsSheet(workbook, "Ringkasan", [["Hari ini", report.totals]]);
  addTotalsSheet(
    workbook,
    "Layanan",
    report.services.map((service) => [service.serviceName, service]),
  );
  const counters = workbook.addWorksheet("Loket");
  counters.addRow([
    "Loket",
    "Petugas",
    "Total tiket",
    "Selesai",
    "Tidak hadir",
    "Kedaluwarsa",
    "Rata-rata tunggu (detik)",
    "Terlama tunggu (detik)",
    "Rata-rata penanganan (detik)",
    "Terlama penanganan (detik)",
  ]);
  for (const counter of report.counters) {
    counters.addRow([
      counter.counterName,
      counter.officerName,
      counter.total,
      counter.done,
      counter.noShow,
      counter.expired,
      counter.wait.averageSeconds,
      counter.wait.maxSeconds,
      counter.handle.averageSeconds,
      counter.handle.maxSeconds,
    ]);
  }
  const hours = workbook.addWorksheet("Per jam");
  hours.addRow(["Jam", "Jumlah tiket"]);
  for (const bucket of report.hours) {
    hours.addRow([String(bucket.hour).padStart(2, "0"), bucket.count]);
  }
  const details = workbook.addWorksheet("Rincian");
  details.addRow([
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
  ]);
  for (const ticket of report.tickets) {
    details.addRow([
      ticket.number,
      ticket.serviceName,
      ticket.counterName ?? "",
      ticket.officerName ?? "",
      ticket.createdAt,
      ticket.calledAt ?? "",
      ticket.finishedAt ?? "",
      durationLabel(ticket.waitSeconds),
      ticket.waitSeconds,
      durationLabel(ticket.handleSeconds),
      ticket.handleSeconds,
      ticket.callCount,
      statusLabel(ticket.status, ticket.autoClosed),
    ]);
  }
  return workbookFile(workbook, `laporan-harian-${report.date}.xlsx`);
}

export async function rangeWorkbook(report: RangeReport): Promise<ReportFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Antrian Bank NTT";
  addTotalsSheet(workbook, "Rekap", [
    ["Rentang", report.totals],
    ...report.days.map((day) => [day.date, day] as [string, ReportTotals]),
  ]);
  return workbookFile(workbook, `rekap-${report.from}-${report.to}.xlsx`);
}

function addTotalsSheet(workbook: ExcelJS.Workbook, name: string, rows: Array<[string, ReportTotals]>) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow([
    "Kelompok",
    "Total tiket",
    "Selesai",
    "Tidak hadir",
    "Kedaluwarsa",
    "Rata-rata tunggu (detik)",
    "Terlama tunggu (detik)",
    "Rata-rata penanganan (detik)",
    "Terlama penanganan (detik)",
  ]);
  for (const [label, totals] of rows) {
    sheet.addRow([
      label,
      totals.total,
      totals.done,
      totals.noShow,
      totals.expired,
      totals.wait.averageSeconds,
      totals.wait.maxSeconds,
      totals.handle.averageSeconds,
      totals.handle.maxSeconds,
    ]);
  }
}

async function workbookFile(workbook: ExcelJS.Workbook, filename: string): Promise<ReportFile> {
  const written = await workbook.xlsx.writeBuffer();
  return { filename, contentType: XLSX, body: Buffer.from(written) };
}
