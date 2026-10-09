import { notFound, redirect } from "next/navigation";
import { AutoPrint } from "@/app/print/[ticketId]/auto-print";
import { TicketSlip } from "@/components/print/ticket-slip";
import { currentUser } from "@/lib/auth/session";
import { loadPrintableTicket } from "@/lib/print/load-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cetak ulang tiket dari Admin. Kiosk tetap memakai /kiosk/print yang dijaga token perangkat. */
export default async function ReprintTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?callbackUrl=/print/${encodeURIComponent(ticketId)}`);
  if (user.role !== "ADMIN") redirect("/counter");
  const ticket = await loadPrintableTicket(ticketId);
  if (!ticket) notFound();

  return (
    <>
      <TicketSlip ticket={ticket} reprint />
      <AutoPrint />
    </>
  );
}
