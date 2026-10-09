/** Ukuran kanvas TV. Seluruh layar dirancang untuk ukuran ini lalu diskalakan ke layar sebenarnya. */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/** Loket per halaman di panel kanan TV: dua kolom × enam baris. */
export const COUNTERS_PER_PAGE = 12;

/** Bagi daftar menjadi halaman yang bergantian otomatis di TV. Daftar kosong tetap satu halaman. */
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }
  return pages;
}

/** Skala dan posisi kanvas supaya pas di layar mana pun tanpa terpotong, dengan sisa tepi rata. */
export function stageFit(width: number, height: number): { scale: number; left: number; top: number } {
  const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
  return {
    scale,
    left: Math.max(0, (width - STAGE_WIDTH * scale) / 2),
    top: Math.max(0, (height - STAGE_HEIGHT * scale) / 2),
  };
}

/** Ukuran huruf nomor panggilan: nomor berawalan dua huruf (AB123) diperkecil supaya tetap muat. */
export function heroNumberSize(number: string): number {
  if (number.length <= 4) return 230;
  if (number.length === 5) return 190;
  return 150;
}
