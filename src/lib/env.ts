const DEFAULT_TIMEZONE = "Asia/Makassar";

/** Tiga zona waktu Indonesia yang bisa dipilih Admin. */
export const INDONESIA_TIME_ZONES = [
  { id: "Asia/Jakarta", label: "WIB", description: "Waktu Indonesia Barat (UTC+7)" },
  { id: "Asia/Makassar", label: "WITA", description: "Waktu Indonesia Tengah (UTC+8)" },
  { id: "Asia/Jayapura", label: "WIT", description: "Waktu Indonesia Timur (UTC+9)" },
] as const;

export type IndonesiaTimeZone = (typeof INDONESIA_TIME_ZONES)[number]["id"];

export function isIndonesiaTimeZone(value: unknown): value is IndonesiaTimeZone {
  return INDONESIA_TIME_ZONES.some((zone) => zone.id === value);
}

const globalForZone = globalThis as typeof globalThis & { queueTimeZoneOverride?: string | null };

/**
 * Zona waktu cabang untuk tanggal antrian, jam di layar, tiket, dan laporan. Pilihan di
 * Admin → Pengaturan menang; bila kosong dipakai APP_TIMEZONE, lalu Asia/Makassar.
 */
export function appTimezone(): string {
  return globalForZone.queueTimeZoneOverride || envTimezone();
}

/** Zona waktu dari .env saja, tanpa pilihan Admin. */
export function envTimezone(): string {
  const configured = process.env.APP_TIMEZONE?.trim();
  return configured ? configured : DEFAULT_TIMEZONE;
}

/** Dipanggil saat pengaturan disimpan atau dibaca ulang dari database. null kembali ke .env. */
export function setTimezoneOverride(value: string | null): void {
  globalForZone.queueTimeZoneOverride = value && isIndonesiaTimeZone(value) ? value : null;
}
