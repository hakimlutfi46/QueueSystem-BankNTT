"use client";

import { useEffect } from "react";

/** Buka lagi halaman kiosk atau TV setelah jeda; proxy memutuskan apakah perangkat sudah boleh masuk. */
export function RetryAfter({ href, seconds }: { href: string; seconds: number }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.replace(href), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [href, seconds]);
  return null;
}
