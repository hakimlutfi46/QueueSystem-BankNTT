import { currentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { loadPrintableTicket } from "@/lib/print/load-ticket";
import { loadTicketPdfOptions, renderTicketPdf, ticketPdfResponse } from "@/lib/print/ticket-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cetak ulang dari Admin sebagai PDF, bertanda CETAK ULANG. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
): Promise<Response> {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") {
    return Response.json({ error: { code: "FORBIDDEN", message: "Halaman ini hanya untuk admin." } }, { status: 403 });
  }
  const { ticketId } = await params;
  const db = getPrisma();
  const ticket = await loadPrintableTicket(ticketId, db);
  if (!ticket) return Response.json({ error: { code: "NOT_FOUND", message: "Tiket tidak ditemukan." } }, { status: 404 });
  return ticketPdfResponse(await renderTicketPdf(ticket, await loadTicketPdfOptions(db, true)), ticket.number);
}
