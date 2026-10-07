import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";

export function BrandHeader({
  branchName,
  trailing,
}: {
  branchName: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="bg-brand-navy text-brand-white">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <BrandLogo variant="onBlue" className="h-12 shrink-0 sm:h-14" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold sm:text-xl">{branchName}</p>
            <p className="text-sm">melayani lebih sungguh</p>
          </div>
        </div>
        {trailing ? <div className="sm:ml-auto">{trailing}</div> : null}
      </div>
      <div className="relative h-5 overflow-hidden bg-brand-white" aria-hidden="true">
        <div
          className="absolute inset-0 bg-brand-orange"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 55%, 0 100%)" }}
        />
        <div
          className="absolute inset-0 bg-brand-navy"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 28%, 0 72%)" }}
        />
      </div>
      <DiagonalStripes />
    </header>
  );
}
