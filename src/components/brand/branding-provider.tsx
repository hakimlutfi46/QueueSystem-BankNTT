"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PublicBranding } from "@/lib/branding";
import { subscribeQueueEvents } from "@/lib/realtime/use-queue-state";

const BrandingContext = createContext<PublicBranding | null>(null);

/**
 * Nama, slogan, dan logo lembaga untuk semua komponen merek. Saat admin menyimpan identitas baru,
 * layar yang sedang terbuka (kiosk, TV, loket) memuat ulang data server dan ikut berubah.
 */
export function BrandingProvider({ value, children }: { value: PublicBranding; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = subscribeQueueEvents((event) => {
      if (event.type !== "CONFIG_CHANGED") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 300);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [router]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): PublicBranding {
  const value = useContext(BrandingContext);
  if (!value) throw new Error("useBranding must be used inside BrandingProvider");
  return value;
}
