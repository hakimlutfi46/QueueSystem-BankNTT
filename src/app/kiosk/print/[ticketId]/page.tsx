import { notFound } from "next/navigation";
import { TicketSlip } from "@/components/print/ticket-slip";
import { loadPrintableTicket } from "@/lib/print/load-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PrintTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const ticket = await loadPrintableTicket(ticketId);
  if (!ticket) notFound();

  return <TicketSlip ticket={ticket} />;
}
