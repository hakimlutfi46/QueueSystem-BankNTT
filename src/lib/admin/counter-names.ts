/**
 * Saran nama dan nomor tampil untuk loket baru. Pengumuman suara membaca kata di nama loket
 * lalu nomor tampilnya, jadi "Teller 3" memakai nomor tampil 3.
 */

type NamedCounter = { name: string; displayNumber: number; isActive: boolean };

/** "Customer Service" menjadi "CS", "Teller" tetap "Teller". */
export function counterBaseName(serviceName: string): string {
  const words = serviceName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Loket";
  if (words.length === 1) return words[0] ?? "Loket";
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

/** Pisahkan "CS 12" menjadi { base: "CS", number: 12 }. Nama tanpa angka di belakang mengembalikan null. */
export function splitCounterName(name: string): { base: string; number: number } | null {
  const match = /^(.*?)\s*(\d+)$/.exec(name.trim());
  if (!match) return null;
  const base = match[1]?.trim() ?? "";
  const number = Number(match[2]);
  if (!base || !Number.isInteger(number)) return null;
  return { base, number };
}

/** Nomor berikutnya untuk satu nama dasar, dihitung dari loket aktif maupun nonaktif agar laporan lama tidak tertukar. */
export function nextCounterNumber(counters: NamedCounter[], base: string): number {
  const key = base.trim().toLowerCase();
  let highest = 0;
  for (const counter of counters) {
    const parts = splitCounterName(counter.name);
    if (parts && parts.base.toLowerCase() === key) highest = Math.max(highest, parts.number);
  }
  return highest + 1;
}

export type PlannedCounter = { name: string; displayNumber: number; taken: boolean };

/** Rencana nama untuk beberapa loket sekaligus, misalnya Teller 3, Teller 4, Teller 5. */
export function planCounters(
  counters: NamedCounter[],
  base: string,
  start: number,
  quantity: number,
): PlannedCounter[] {
  const activeNames = new Set(
    counters.filter((counter) => counter.isActive).map((counter) => counter.name.trim().toLowerCase()),
  );
  const cleanBase = base.trim();
  const count = Math.max(0, Math.min(Math.floor(quantity), 20));
  const first = Math.max(1, Math.floor(start));
  return Array.from({ length: count }, (_, index) => {
    const number = first + index;
    const name = cleanBase ? `${cleanBase} ${number}` : String(number);
    return { name, displayNumber: number, taken: activeNames.has(name.toLowerCase()) };
  });
}
