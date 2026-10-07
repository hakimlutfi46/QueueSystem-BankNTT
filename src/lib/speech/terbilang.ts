const ONES = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"] as const;

export function terbilang(value: number): string {
  return terbilangParts(value).join(" ");
}

export function terbilangParts(value: number): string[] {
  if (!Number.isInteger(value) || value < 0 || value > 999_999_999) {
    throw new Error("terbilang expects an integer from 0 to 999999999.");
  }
  if (value === 0) return ["nol"];
  return spell(value);
}

function spell(value: number): string[] {
  if (value < 1_000) return belowThousand(value);
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1_000);
    const rest = value % 1_000;
    const head = thousands === 1 ? ["seribu"] : [...belowThousand(thousands), "ribu"];
    return rest === 0 ? head : [...head, ...belowThousand(rest)];
  }
  const millions = Math.floor(value / 1_000_000);
  const rest = value % 1_000_000;
  const head = [...(millions === 1 ? ["satu"] : belowThousand(millions)), "juta"];
  return rest === 0 ? head : [...head, ...spell(rest)];
}

function belowThousand(value: number): string[] {
  if (value <= 0) return [];
  if (value < 10) return [ONES[value] ?? ""];
  if (value === 10) return ["sepuluh"];
  if (value === 11) return ["sebelas"];
  if (value < 20) return [ONES[value - 10] ?? "", "belas"];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const rest = value % 10;
    const head = [ONES[tens] ?? "", "puluh"];
    return rest === 0 ? head : [...head, ...belowThousand(rest)];
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const head = hundreds === 1 ? ["seratus"] : [ONES[hundreds] ?? "", "ratus"];
  return rest === 0 ? head : [...head, ...belowThousand(rest)];
}
