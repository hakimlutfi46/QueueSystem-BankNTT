"use client";

/**
 * Salin teks ke papan klip. navigator.clipboard hanya ada di koneksi aman (HTTPS atau localhost),
 * padahal Admin cabang sering dibuka lewat http://192.168.x.x. Bila tidak tersedia atau ditolak,
 * dipakai cara lama lewat textarea tersembunyi dan execCommand("copy"). Benar bila berhasil.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Lanjut ke cara lama, misalnya bila izin papan klip ditolak.
    }
  }
  return copyWithTextarea(text);
}

function copyWithTextarea(text: string): boolean {
  if (typeof document === "undefined") return false;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  previous?.focus();
  return copied;
}

/** Pilih isi sebuah elemen supaya pengguna tinggal menekan Ctrl+C atau Cmd+C. */
export function selectContents(element: HTMLElement | null): void {
  if (!element) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}
