import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError } from "@/lib/admin/errors";
import { isIsoDate } from "@/lib/reports/dates";
import { dailyCsv, rangeCsv } from "@/lib/reports/csv";
import { loadDailyReport, loadRangeReport } from "@/lib/reports/query";
import type { ReportFile } from "@/lib/reports/types";
import { dailyWorkbook, rangeWorkbook } from "@/lib/reports/workbook";

export async function exportReport(db: PrismaClient, search: URLSearchParams): Promise<ReportFile> {
  const format = search.get("format");
  if (format !== "xlsx" && format !== "csv") {
    throw new AdminError("VALIDATION", "Format tidak valid.");
  }
  const from = search.get("from");
  const to = search.get("to");
  const date = search.get("date");
  if (from && to) {
    const report = await loadRangeReport(db, from, to);
    return format === "xlsx" ? rangeWorkbook(report) : rangeCsv(report);
  }
  if (!date || !isIsoDate(date)) throw new AdminError("VALIDATION", "Tanggal tidak valid.");
  const report = await loadDailyReport(db, date);
  return format === "xlsx" ? dailyWorkbook(report) : dailyCsv(report);
}
