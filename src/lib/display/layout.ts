/** Ukuran kanvas TV. Seluruh layar dirancang untuk ukuran ini lalu diskalakan ke layar sebenarnya. */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/** Loket per halaman di panel kanan TV: dua kolom × enam baris. */
export const COUNTERS_PER_PAGE = 12;

/** Baris per kolom loket di TV. */
export const COUNTER_ROWS = COUNTERS_PER_PAGE / 2;

export type CounterColumnsPage<T> = { left: T[]; right: T[]; rows: number };

/**
 * Susun loket ke dua kolom TV per halaman. Loket dikelompokkan menurut layanan yang dilayaninya
 * (misalnya CS dan Teller), dan satu kelompok tidak dipecah ke dua kolom: CS di kiri, Teller di kanan.
 * Bila pembagian per kelompok terlalu timpang sampai butuh halaman tambahan, loket dibagi rata
 * separuh-separuh. Urutan masukan dipertahankan (biasanya urut nama).
 */
export function counterColumns<T extends { serviceIds: number[] }>(counters: T[]): CounterColumnsPage<T>[] {
  if (counters.length === 0) return [{ left: [], right: [], rows: 4 }];

  const groups: T[][] = [];
  let currentKey: string | null = null;
  for (const counter of counters) {
    const key = [...counter.serviceIds].sort((a, b) => a - b).join(",");
    if (key !== currentKey) {
      groups.push([]);
      currentKey = key;
    }
    groups[groups.length - 1]!.push(counter);
  }

  // Titik potong antarkelompok yang paling seimbang.
  let best: { left: T[]; right: T[] } | null = null;
  for (let cut = 1; cut < groups.length; cut += 1) {
    const left = groups.slice(0, cut).flat();
    const right = groups.slice(cut).flat();
    if (!best || Math.abs(left.length - right.length) < Math.abs(best.left.length - best.right.length)) {
      best = { left, right };
    }
  }

  const evenPages = Math.ceil(counters.length / COUNTERS_PER_PAGE);
  const groupPages = best ? Math.max(Math.ceil(best.left.length / COUNTER_ROWS), Math.ceil(best.right.length / COUNTER_ROWS)) : Infinity;
  if (best && groupPages <= evenPages) {
    const pages: CounterColumnsPage<T>[] = [];
    for (let page = 0; page < groupPages; page += 1) {
      const left = best.left.slice(page * COUNTER_ROWS, (page + 1) * COUNTER_ROWS);
      const right = best.right.slice(page * COUNTER_ROWS, (page + 1) * COUNTER_ROWS);
      pages.push({ left, right, rows: rowsFor(Math.max(left.length, right.length)) });
    }
    return pages;
  }

  // Satu kelompok saja, atau kelompok terlalu timpang: separuh pertama di kiri, sisanya di kanan.
  return paginate(counters, COUNTERS_PER_PAGE).map((page) => {
    const half = Math.ceil(page.length / 2);
    return { left: page.slice(0, half), right: page.slice(half), rows: rowsFor(half) };
  });
}

/** Paling sedikit 4 baris supaya kartu loket tidak terlalu tinggi, paling banyak 6. */
function rowsFor(count: number): number {
  return Math.min(COUNTER_ROWS, Math.max(4, count));
}

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
