import { AdminError } from "@/lib/admin/errors";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function assertRange(from: string, to: string): void {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    throw new AdminError("VALIDATION", "Rentang tanggal tidak valid.");
  }
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new AdminError("VALIDATION", "Rentang tanggal tidak valid.");
  }
}
