/** Tombol layanan kiosk paling enak disentuh bila kira-kira 2,6 kali lebih lebar daripada tingginya. */
const IDEAL_ASPECT = 2.6;
/** Di bawah tinggi ini tombol terlalu kecil untuk jari; kiosk beralih ke daftar yang bisa digulir. */
export const MIN_BUTTON_HEIGHT = 96;
const MAX_COLUMNS = 5;

export type KioskGrid = { columns: number; rows: number; scroll: boolean };

/**
 * Pilih jumlah kolom yang membuat tombol sebesar mungkin di ruang yang tersedia, dengan semua layanan
 * tampil sekaligus. Ukuran efektif = sisi terpendek tombol bila dipaksa ke rasio ideal.
 */
export function kioskGrid(count: number, width: number, height: number, gap: number): KioskGrid {
  if (count <= 0 || width <= 0 || height <= 0) return { columns: 1, rows: 1, scroll: false };
  let best: (KioskGrid & { score: number }) | null = null;
  for (let columns = 1; columns <= Math.min(count, MAX_COLUMNS); columns += 1) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const cellHeight = (height - gap * (rows - 1)) / rows;
    if (cellHeight < MIN_BUTTON_HEIGHT || cellWidth < 200) continue;
    const score = Math.min(cellHeight, cellWidth / IDEAL_ASPECT);
    if (!best || score > best.score + 0.5) best = { columns, rows, scroll: false, score };
  }
  if (best) return { columns: best.columns, rows: best.rows, scroll: false };
  // Terlalu banyak layanan untuk satu layar: kolom sebanyak lebar mengizinkan, lalu digulir.
  const columns = Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + gap) / (260 + gap)), count));
  return { columns, rows: Math.ceil(count / columns), scroll: true };
}
