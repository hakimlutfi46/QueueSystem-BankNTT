"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/**
 * Benar bila halaman sudah memenuhi layar: lewat tombol layar penuh, atau karena Chrome dijalankan
 * dengan --kiosk (jendela seukuran layar tanpa bilah alamat).
 */
function readFullscreen(): boolean {
  if (document.fullscreenElement) return true;
  return window.innerWidth >= window.screen.width - 1 && window.innerHeight >= window.screen.height - 1;
}

export function useIsFullscreen(): boolean {
  return useSyncExternalStore(subscribe, readFullscreen, () => true);
}

export function enterFullscreen(): void {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
}

/** Masuk layar penuh pada sentuhan atau tombol pertama di halaman ini. Browser mewajibkan interaksi dulu. */
export function useFullscreenOnFirstTouch(): void {
  useEffect(() => {
    const onFirst = () => {
      enterFullscreen();
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
    window.addEventListener("pointerdown", onFirst);
    window.addEventListener("keydown", onFirst);
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
  }, []);
}

/** Tombol kecil "Layar penuh". Tersembunyi bila halaman sudah memenuhi layar. */
export function FullscreenButton({ className }: { className?: string }) {
  const fullscreen = useIsFullscreen();
  if (fullscreen) return null;
  return (
    <button
      type="button"
      onClick={enterFullscreen}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-brand-white/40 px-3 py-2 text-sm font-bold text-brand-white hover:bg-brand-white/10",
        className,
      )}
    >
      <Icon name="maximize" className="size-4" />
      Layar penuh
    </button>
  );
}
