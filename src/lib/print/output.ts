/**
 * Ke mana tiket kiosk dikeluarkan.
 *
 * - "printer": dicetak langsung ke printer thermal lewat dialog cetak Chrome (mode kiosk).
 * - "pdf": diunduh sebagai berkas PDF seukuran kertas thermal, untuk mencoba tanpa printer.
 *
 * Diatur lewat TICKET_OUTPUT di .env. Bila kosong, `npm run dev` memakai pdf dan build produksi
 * memakai printer. "dev" dan "prod" diterima sebagai nama lain untuk pdf dan printer.
 */
export type TicketOutput = "pdf" | "printer";

export function ticketOutput(env: NodeJS.ProcessEnv = process.env): TicketOutput {
  const value = env.TICKET_OUTPUT?.trim().toLowerCase();
  if (value === "pdf" || value === "dev") return "pdf";
  if (value === "printer" || value === "print" || value === "prod") return "printer";
  return env.NODE_ENV === "production" ? "printer" : "pdf";
}
