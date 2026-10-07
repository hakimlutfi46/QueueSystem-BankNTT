import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { appTimezone } from "@/lib/env";

export type PrintableTicketView = {
  id: string;
  number: string;
  serviceName: string;
  aheadCount: number;
  issuedAt: string;
  branchName: string;
  footer: string;
  widthMm: number;
};

export async function loadPrintableTicket(
  ticketId: string,
  db: PrismaClient = getPrisma(),
): Promise<PrintableTicketView | null> {
  if (!/^\d+$/.test(ticketId)) return null;

  const rows = await db.$queryRaw<
    {
      id: string;
      number: string;
      service_name: string;
      ahead_count: number;
      created_at: Date;
    }[]
  >`
    SELECT
      ticket.id::text AS id,
      ticket.number,
      service.name AS service_name,
      (
        SELECT count(*)::int
        FROM tickets AS waiting
        WHERE waiting.service_id = ticket.service_id
          AND waiting.service_date = ticket.service_date
          AND waiting.status = 'WAITING'
          AND waiting.seq < ticket.seq
      ) AS ahead_count,
      ticket.created_at
    FROM tickets AS ticket
    JOIN services AS service ON service.id = ticket.service_id
    WHERE ticket.id = ${ticketId}::bigint
  `;
  const ticket = rows[0];
  if (!ticket) return null;

  const settings = await db.$queryRaw<{ key: string; value: unknown }[]>`
    SELECT key, value FROM settings WHERE key IN ('branch_name', 'ticket_footer', 'ticket_width_mm')
  `;
  const values = new Map(settings.map((row) => [row.key, row.value]));
  const width = values.get("ticket_width_mm");
  const branchName = values.get("branch_name");
  const footer = values.get("ticket_footer");

  return {
    id: ticket.id,
    number: ticket.number,
    serviceName: ticket.service_name,
    aheadCount: Number(ticket.ahead_count),
    issuedAt: new Intl.DateTimeFormat("id-ID", {
      timeZone: appTimezone(),
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(ticket.created_at)),
    branchName: typeof branchName === "string" ? branchName : "Bank NTT",
    footer: typeof footer === "string" ? footer : "",
    widthMm: width === 58 || width === 80 ? width : 80,
  };
}
