/** Tombol layanan kiosk paling enak disentuh bila kira-kira 2,6 kali lebih lebar daripada tingginya. */
const IDEAL_ASPECT = 2.6;
/** Di bawah tinggi ini tombol terlalu kecil untuk jari; kiosk beralih ke daftar yang bisa digulir. */
export const MIN_BUTTON_HEIGHT = 96;
/** Di atas tinggi ini tombol tidak perlu diperbesar lagi agar tidak terlihat terlalu raksasa. */
export const MAX_BUTTON_HEIGHT = 160;
const MAX_COLUMNS = 5;

export type KioskGrid = { columns: number; rows: number; scroll: boolean };
export type KioskGap = number | { x: number; y: number };

/**
 * Pilih jumlah kolom yang membuat tombol sebesar mungkin di ruang yang tersedia, dengan batasan
 * tinggi maksimal agar kartu tidak tampak terlalu lebar/raksasa pada layar besar.
 */
export function kioskGrid(count: number, width: number, height: number, gap: KioskGap): KioskGrid {
  if (count <= 0 || width <= 0 || height <= 0) return { columns: 1, rows: 1, scroll: false };
  const gapX = typeof gap === "object" ? gap.x : gap;
  const gapY = typeof gap === "object" ? gap.y : gap;
  let best: (KioskGrid & { score: number }) | null = null;
  for (let columns = 1; columns <= Math.min(count, MAX_COLUMNS); columns += 1) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (width - gapX * (columns - 1)) / columns;
    const cellHeight = (height - gapY * (rows - 1)) / rows;
    if (cellHeight < MIN_BUTTON_HEIGHT || cellWidth < 200) continue;
    const effectiveHeight = Math.min(cellHeight, MAX_BUTTON_HEIGHT);
    const score = Math.min(effectiveHeight, cellWidth / IDEAL_ASPECT);
    if (!best || score > best.score + 0.5 || (Math.abs(score - best.score) <= 0.5 && columns > best.columns)) {
      best = { columns, rows, scroll: false, score };
    }
  }
  if (best) return { columns: best.columns, rows: best.rows, scroll: false };
  // Terlalu banyak layanan untuk satu layar: kolom sebanyak lebar mengizinkan, lalu digulir.
  const columns = Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + gapX) / (260 + gapX)), count));
  return { columns, rows: Math.ceil(count / columns), scroll: true };
}
