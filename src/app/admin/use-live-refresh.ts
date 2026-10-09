"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeQueueEvents } from "@/lib/realtime/use-queue-state";

/**
 * Muat ulang data server halaman admin saat event tertentu datang, misalnya petugas membuka loket.
 * Halaman harus juga memakai useQueueState() supaya aliran SSE hidup.
 */
export function useLiveRefresh(types: string[]): void {
  const router = useRouter();
  const key = types.join(",");

  useEffect(() => {
    const wanted = new Set(key.split(","));
    let timer: number | undefined;
    const unsubscribe = subscribeQueueEvents((event) => {
      if (!wanted.has(event.type)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 300);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [key, router]);
}
