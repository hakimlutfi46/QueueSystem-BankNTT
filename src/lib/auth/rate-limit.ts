/**
 * Batas percobaan yang gagal per kunci (misalnya alamat IP atau nama pengguna) dalam satu jendela waktu.
 * Disimpan di memori proses: cukup untuk satu server cabang, dan hilang saat server dimulai ulang.
 */
type Entry = { failures: number; resetAt: number };

export type RateLimit = ReturnType<typeof createRateLimit>;

export function createRateLimit(max: number, windowMs: number) {
  const entries = new Map<string, Entry>();

  function current(key: string, now: number): Entry | null {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.resetAt <= now) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  return {
    /** Detik yang harus ditunggu, atau 0 bila boleh mencoba. */
    blockedFor(key: string, now = Date.now()): number {
      const entry = current(key, now);
      return entry && entry.failures >= max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
    },
    fail(key: string, now = Date.now()): void {
      const entry = current(key, now) ?? { failures: 0, resetAt: now + windowMs };
      entry.failures += 1;
      entries.set(key, entry);
      if (entries.size > 5000) {
        for (const [other, value] of entries) if (value.resetAt <= now) entries.delete(other);
      }
    },
    reset(key: string): void {
      entries.delete(key);
    },
  };
}

/** Detik tunggu terlama dari beberapa batas sekaligus. */
export function longestWait(checks: [RateLimit, string][], now = Date.now()): number {
  return Math.max(0, ...checks.map(([limit, key]) => limit.blockedFor(key, now)));
}

export function waitText(seconds: number): string {
  return seconds < 60 ? `${seconds} detik` : `${Math.ceil(seconds / 60)} menit`;
}

/**
 * Alamat pengirim dari header yang diisi Next.js (atau proxy di depannya). Header ini bisa dipalsukan
 * bila server dibuka langsung, jadi batas per IP selalu didampingi batas yang tidak bergantung pada IP.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

const MINUTE = 60 * 1000;

/**
 * Kode pemasangan: 6 karakter dari 32 huruf (sekitar satu miliar kemungkinan), berlaku 30 menit.
 * 10 kode salah per IP per 10 menit, dan 100 untuk semua IP bersama, jadi menebak tidak mungkin
 * meski IP dipalsukan.
 */
export const PAIR_MAX_FAILURES = 10;
export const pairRateLimit = {
  perAddress: createRateLimit(PAIR_MAX_FAILURES, 10 * MINUTE),
  overall: createRateLimit(100, 10 * MINUTE),
};

/**
 * Perangkat yang mendaftar sendiri tanpa kode (aplikasi kiosk/TV atau browser di /kiosk dan /display).
 * Setiap pendaftaran dihitung: 10 per IP dan 60 untuk semua IP per 10 menit. Perangkat baru tetap
 * menunggu persetujuan admin; batas ini hanya menahan banjir baris di Admin → Perangkat.
 */
export const autoRegisterRateLimit = {
  perAddress: createRateLimit(10, 10 * MINUTE),
  overall: createRateLimit(60, 10 * MINUTE),
};

/**
 * Masuk: 5 kata sandi salah per IP dan nama pengguna dalam 15 menit. Batas 20 per nama pengguna dari
 * IP mana pun menahan tebakan beruntun yang memalsukan IP, tanpa mudah mengunci akun dari luar.
 * 50 per IP untuk semua nama pengguna menahan penjelajahan banyak akun dari satu komputer.
 */
export const LOGIN_MAX_FAILURES = 5;
export const loginRateLimit = {
  perAccountAddress: createRateLimit(LOGIN_MAX_FAILURES, 15 * MINUTE),
  perAccount: createRateLimit(20, 15 * MINUTE),
  perAddress: createRateLimit(50, 15 * MINUTE),
};
