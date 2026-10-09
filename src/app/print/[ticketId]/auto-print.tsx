"use client";

import { useEffect } from "react";

export function AutoPrint() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <p className="mt-6 text-center text-sm print:hidden">
      Dialog cetak terbuka otomatis.{" "}
      <button type="button" className="font-bold underline" onClick={() => window.print()}>
        Cetak lagi
      </button>
    </p>
  );
}
