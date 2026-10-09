"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Kecilkan ukuran huruf sebuah kotak sampai seluruh isinya muat, tanpa memotong tulisan. Isi kotak
 * memakai ukuran relatif (em), jadi semua baris ikut mengecil bersama. Dihitung ulang saat ukuran
 * kotak atau teksnya berubah.
 */
export function useFitText<T extends HTMLElement>(maxPx: number, minPx: number, deps: unknown[]) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      let size = maxPx;
      element.style.fontSize = `${size}px`;
      while (size > minPx && overflows(element)) {
        size -= 1;
        element.style.fontSize = `${size}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPx, minPx, ...deps]);

  return ref;
}

function overflows(element: HTMLElement): boolean {
  if (element.scrollHeight > element.clientHeight + 1) return true;
  return [...element.querySelectorAll<HTMLElement>("*")].some((child) => child.scrollWidth > child.clientWidth + 1);
}
