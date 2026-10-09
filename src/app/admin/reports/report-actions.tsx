"use client";

import { BrandButton } from "@/components/brand/brand-button";
import { Icon } from "@/components/ui/icon";

export function ReportActions({ href }: { href: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <BrandButton href={`${href}&format=xlsx`} variant="outline" size="sm">
        <Icon name="download" className="size-4" />
        Unduh Excel
      </BrandButton>
      <BrandButton href={`${href}&format=csv`} variant="outline" size="sm">
        <Icon name="download" className="size-4" />
        Unduh CSV
      </BrandButton>
      <BrandButton type="button" variant="outline" size="sm" onClick={() => window.print()}>
        <Icon name="printer" className="size-4" />
        Cetak
      </BrandButton>
    </div>
  );
}
