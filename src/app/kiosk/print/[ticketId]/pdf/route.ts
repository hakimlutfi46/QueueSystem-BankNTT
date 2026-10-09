import { getPrisma } from "@/lib/db";
import { loadPrintableTicket } from "@/lib/print/load-ticket";
import { loadTicketPdfOptions, renderTicketPdf, ticketPdfResponse } from "@/lib/print/ticket-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tiket sebagai PDF untuk kiosk dalam mode TICKET_OUTPUT=pdf. Dijaga token kiosk lewat proxy. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
): Promise<Response> {
  const { ticketId } = await params;
  const db = getPrisma();
  const ticket = await loadPrintableTicket(ticketId, db);
  if (!ticket) return Response.json({ error: { code: "NOT_FOUND", message: "Tiket tidak ditemukan." } }, { status: 404 });
  return ticketPdfResponse(await renderTicketPdf(ticket, await loadTicketPdfOptions(db)), ticket.number);
}
