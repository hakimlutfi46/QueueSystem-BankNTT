/**
 * Batas percobaan kode pemasangan per alamat IP. Kode 6 karakter dari 32 huruf (sekitar satu miliar
 * kemungkinan) yang berlaku 30 menit tidak bisa ditebak dengan 10 percobaan per 10 menit.
 * Disimpan di memori proses: cukup untuk satu server cabang, dan hilang saat server dimulai ulang.
 */
export const PAIR_MAX_FAILURES = 10;
export const PAIR_WINDOW_MS = 10 * 60 * 1000;

type Entry = { failures: number; resetAt: number };

export function createPairRateLimit(max = PAIR_MAX_FAILURES, windowMs = PAIR_WINDOW_MS) {
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
      if (entries.size > 1000) {
        for (const [other, value] of entries) if (value.resetAt <= now) entries.delete(other);
      }
    },
    reset(key: string): void {
      entries.delete(key);
    },
  };
}

export const pairRateLimit = createPairRateLimit();
