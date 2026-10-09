import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getPrisma } = await import("@/lib/db");
  const { ensureDayClosed, startDayClose } = await import("@/lib/queue/day-close");
  const { refreshTimezone } = await import("@/lib/admin/settings");
  // Zona waktu pilihan Admin dibaca sebelum tutup hari, karena menentukan tanggal antrian.
  startDayClose(async () => {
    await refreshTimezone(getPrisma());
    await ensureDayClosed(getPrisma());
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Request failed ${request.method} ${request.path}: ${message}`);
};
