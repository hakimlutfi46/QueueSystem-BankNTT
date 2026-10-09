"use client";

import { useSyncExternalStore } from "react";

let clockNow = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    clockNow = Date.now();
    timer = setInterval(() => {
      clockNow = Date.now();
      for (const notify of listeners) notify();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Waktu sekarang dalam milidetik, berdetak tiap detik. Bernilai 0 saat render di server. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => clockNow,
    () => 0,
  );
}

/** Detik sejak waktu ISO tertentu, atau null bila belum ada waktu atau jam belum berjalan. */
export function secondsSince(iso: string | null | undefined, now: number): number | null {
  if (!iso || now === 0) return null;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
}
