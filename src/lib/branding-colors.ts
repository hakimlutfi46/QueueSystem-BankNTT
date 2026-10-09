/** Lima warna merek yang bisa diganti admin, dan aturan kontras dari bagian Design system di PLAN.md. */

export const BRAND_COLOR_KEYS = ["navy", "blue", "sky", "orange", "deep"] as const;
export type BrandColorKey = (typeof BRAND_COLOR_KEYS)[number];
export type BrandColors = Partial<Record<BrandColorKey, string>>;

export const BRAND_COLOR_LABELS: Record<BrandColorKey, { label: string; usage: string }> = {
  navy: { label: "Utama", usage: "Header, tombol utama, judul" },
  blue: { label: "Sekunder", usage: "Tombol sekunder, tautan, hover" },
  sky: { label: "Aksen terang", usage: "Garis miring, sorotan, cahaya kartu" },
  orange: { label: "Sorotan", usage: "Nomor yang baru dipanggil, peringatan target" },
  deep: { label: "Latar TV", usage: "Latar layar TV dan panel masuk" },
};

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Ubah warna dari CSS menjadi hex enam digit huruf kecil. CSS yang sudah di-minify bisa menulis putih
 * sebagai tiga digit, dan browser kadang mengembalikan rgb(...). Nilai yang tidak dikenali menjadi "".
 */
export function normalizeHex(value: string): string {
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(text);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
  }
  return "";
}

/** Rasio kontras WCAG antara dua warna hex enam digit. */
export function contrastRatio(foreground: string, background: string): number {
  const light = luminance(foreground);
  const dark = luminance(background);
  const [high, low] = light > dark ? [light, dark] : [dark, light];
  return Math.round(((high + 0.05) / (low + 0.05)) * 10) / 10;
}

export type ContrastCheck = { pair: string; ratio: number; minimum: number; ok: boolean };

/** Pasangan warna yang benar-benar dipakai di layar, dengan batas minimal masing-masing. */
export function checkContrast(colors: Record<BrandColorKey, string>, white: string): ContrastCheck[] {
  const checks: Array<[string, string, string, number]> = [
    ["Teks putih di atas warna utama", white, colors.navy, 4.5],
    ["Teks putih di atas warna sekunder", white, colors.blue, 4.5],
    ["Teks putih di atas latar TV", white, colors.deep, 4.5],
    ["Nomor sorotan di atas latar TV", colors.orange, colors.deep, 3],
    ["Warna utama di atas putih", colors.navy, white, 4.5],
  ];
  return checks.map(([pair, foreground, background, minimum]) => {
    const ratio = contrastRatio(foreground, background);
    return { pair, ratio, minimum, ok: ratio >= minimum };
  });
}

/** CSS yang menimpa warna merek bawaan. Hanya nilai hex yang lolos validasi yang ditulis. */
export function brandColorCss(colors: BrandColors): string {
  const lines = BRAND_COLOR_KEYS.flatMap((key) => {
    const value = colors[key];
    return value && HEX_COLOR.test(value) ? [`--brand-${key}:${value.toLowerCase()};`] : [];
  });
  return lines.length ? `html:root{${lines.join("")}}` : "";
}

function luminance(hex: string): number {
  const value = HEX_COLOR.test(hex) ? hex.slice(1) : "000000";
  const channels = [0, 2, 4].map((start) => {
    const channel = parseInt(value.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}
