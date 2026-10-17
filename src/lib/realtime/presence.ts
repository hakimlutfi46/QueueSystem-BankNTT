import type { DeviceKind } from "@/lib/auth/device";

/**
 * Kiosk dan TV yang sepi hanya memegang satu sambungan /api/stream yang terus terbuka, tanpa permintaan
 * lain. "Terakhir aktif" dicatat per permintaan, jadi tanpa ini perangkat yang masih menyala tampil
 * "Tidak aktif" di Admin setelah 3 menit tanpa antrian. Selama sambungan terbuka, token perangkat diperiksa
 * ulang secara berkala: catatan terakhir aktif ikut diperbarui, dan perangkat yang dicabut diputus.
 */
export const PRESENCE_INTERVAL_MS = 45_000;

export type DeviceCredential = { kind: DeviceKind; token: string };

export function keepDevicePresence(options: {
  credentials: DeviceCredential[];
  verify: (kind: DeviceKind, token: string) => Promise<boolean>;
  onRevoked: () => void;
  signal: AbortSignal;
  intervalMs?: number;
}): void {
  if (options.credentials.length === 0 || options.signal.aborted) return;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const results = await Promise.all(options.credentials.map(({ kind, token }) => options.verify(kind, token)));
      if (!results.some(Boolean)) {
        clearInterval(timer);
        options.onRevoked();
      }
    } catch {
      // Database sesaat tidak terjangkau: coba lagi pada putaran berikutnya, sambungan tetap dibiarkan.
    } finally {
      busy = false;
    }
  }, options.intervalMs ?? PRESENCE_INTERVAL_MS);
  timer.unref?.();
  options.signal.addEventListener("abort", () => clearInterval(timer), { once: true });
}
