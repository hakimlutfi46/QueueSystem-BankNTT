import { formatDuration } from "@/lib/format-duration";

const statusNames: Record<string, string> = {
  WAITING: "Menunggu",
  SERVING: "Sedang ditangani",
  DONE: "Selesai",
  NO_SHOW: "Tidak hadir",
  EXPIRED: "Kedaluwarsa",
};

export function statusLabel(status: string, autoClosed: boolean): string {
  const name = statusNames[status] ?? status;
  return autoClosed ? `${name} (tutup otomatis)` : name;
}

export function durationLabel(seconds: number | null): string {
  return seconds == null ? "—" : formatDuration(seconds);
}

export function clockLabel(value: string | null): string {
  return value ?? "—";
}
