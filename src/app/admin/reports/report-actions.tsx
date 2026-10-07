"use client";

import { BrandButton } from "@/components/brand/brand-button";

export function ReportActions({ href }: { href: string }) {
  return (
    <div className="flex flex-wrap gap-3 print:hidden">
      <BrandButton href={`${href}&format=xlsx`} variant="secondary">Unduh Excel</BrandButton>
      <BrandButton href={`${href}&format=csv`} variant="secondary">Unduh CSV</BrandButton>
      <BrandButton type="button" variant="secondary" onClick={() => window.print()}>Cetak</BrandButton>
    </div>
  );
}
