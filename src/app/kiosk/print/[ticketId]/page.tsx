import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
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

  const contentWidth = Math.max(ticket.widthMm - 8, 40);

  return (
    <main
      className="mx-auto bg-white px-4 py-6 text-center text-black"
      style={{ width: `${contentWidth}mm` }}
    >
      <style>{`
        @page { size: ${ticket.widthMm}mm auto; margin: 0; }
        html, body { background: white; color: black; }
      `}</style>
      <BrandLogo variant="color" className="mx-auto h-16 grayscale" />
      <p className="mt-3 text-base font-bold">{ticket.branchName}</p>
      <p className="mt-4 text-sm font-bold tracking-wide">NOMOR ANTRIAN</p>
      <p className="mt-2 text-[72pt] font-bold leading-none tabular-nums">{ticket.number}</p>
      <p className="mt-3 text-lg font-bold">{ticket.serviceName}</p>
      <p className="mt-2 text-sm">{ticket.issuedAt}</p>
      <p className="mt-3 text-sm font-bold">{ticket.aheadCount} antrian di depan Anda</p>
      {ticket.footer ? <p className="mt-4 text-xs">{ticket.footer}</p> : null}
      <p className="mt-2 text-xs">melayani lebih sungguh</p>
    </main>
  );
}