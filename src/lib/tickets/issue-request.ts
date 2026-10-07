import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { QueueError, issueTicket } from "@/lib/queue";
import { ensureDayClosed } from "@/lib/queue/day-close";

const issueTicketBody = z.object({
  serviceId: z.number().int().positive(),
  requestId: z.uuid(),
});

const clientErrors: Record<string, { status: number; message: string }> = {
  SERVICE_NOT_FOUND: { status: 404, message: "Layanan tidak ditemukan." },
  SERVICE_INACTIVE: { status: 409, message: "Layanan tidak aktif." },
};

export async function issueTicketResponse(db: PrismaClient, body: unknown): Promise<Response> {
  const parsed = issueTicketBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION", message: "Data tiket tidak valid." } },
      { status: 400 },
    );
  }

  try {
    await ensureDayClosed(db);
    const issued = await issueTicket(db, parsed.data);
    return Response.json({
      ticket: {
        id: issued.ticket.id.toString(),
        number: issued.ticket.number,
        serviceId: issued.ticket.serviceId,
        serviceDate: issued.ticket.serviceDate,
        seq: issued.ticket.seq,
        status: issued.ticket.status,
        createdAt: issued.ticket.createdAt.toISOString(),
      },
      aheadCount: issued.aheadCount,
    });
  } catch (error) {
    if (error instanceof QueueError) {
      const known = clientErrors[error.code];
      if (known) {
        return Response.json(
          { error: { code: error.code, message: known.message } },
          { status: known.status },
        );
      }
    }
    console.error(error);
    return Response.json(
      { error: { code: "TICKET_FAILED", message: "Tiket tidak dapat dibuat." } },
      { status: 500 },
    );
  }
}
