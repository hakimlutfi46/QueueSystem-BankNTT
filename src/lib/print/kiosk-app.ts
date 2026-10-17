/**
 * Jembatan ke aplikasi kiosk Windows (apps/kiosk-desktop). Aplikasi itu memasang `window.kioskApp`
 * lewat preload, lalu mencetak tiket langsung ke printer pilihan tanpa dialog. Di browser biasa
 * objek ini tidak ada dan kiosk tetap memakai printTicket atau PDF.
 */
export type KioskPrinterStatus = { ready: boolean; printer: string | null; message: string | null };
export type KioskPrintResult = { ok: boolean; message: string | null };

export type KioskApp = {
  version: string;
  printerStatus: () => Promise<KioskPrinterStatus>;
  printTicket: (ticketId: string) => Promise<KioskPrintResult>;
};

export function kioskApp(target: { kioskApp?: unknown } = globalThis as { kioskApp?: unknown }): KioskApp | null {
  const app = target.kioskApp as Partial<KioskApp> | undefined;
  if (!app || typeof app.printerStatus !== "function" || typeof app.printTicket !== "function") return null;
  return app as KioskApp;
}

/** Status printer yang tidak pernah melempar galat: kegagalan jembatan dianggap printer tidak siap. */
export async function readPrinterStatus(app: KioskApp): Promise<KioskPrinterStatus> {
  try {
    return await app.printerStatus();
  } catch {
    return { ready: false, printer: null, message: "Printer tidak bisa diperiksa." };
  }
}
