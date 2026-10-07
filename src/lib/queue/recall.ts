import type { PrismaClient } from "@/generated/prisma/client";
import { QueueError } from "@/lib/queue/errors";
import { lockCounter, mapTicket, maxRecall, queueTransaction, recordEvent } from "@/lib/queue/sql";
import type { CounterActionInput, QueueTicket } from "@/lib/queue/types";

export async function recallTicket(db: PrismaClient, input: CounterActionInput): Promise<QueueTicket> {
  return db.$transaction(async (tx) => {
    await lockCounter(tx, input.counterId, input.userId);
    const limit = await maxRecall(tx);
    const rows = await tx.$queryRaw<
      {
        id: string;
        request_id: string;
        service_id: number;
        service_date: string;
        seq: number;
        number: string;
        status: QueueTicket["status"];
        counter_id: number | null;
        served_by: number | null;
        call_count: number;
        auto_closed: boolean;
        created_at: Date;
        called_at: Date | null;
        finished_at: Date | null;
      }[]
    >`
      SELECT
        id::text AS id,
        request_id,
        service_id,
        to_char(service_date, 'YYYY-MM-DD') AS service_date,
        seq,
        number,
        status::text AS status,
        counter_id,
        served_by,
        call_count,
        auto_closed,
        created_at,
        called_at,
        finished_at
      FROM tickets
      WHERE counter_id = ${input.counterId}
        AND status = 'SERVING'
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) {
      throw new QueueError("NO_ACTIVE_TICKET", "This counter has no ticket in service.");
    }
    const recallsSoFar = current.call_count - 1;
    if (recallsSoFar >= limit) {
      throw new QueueError("RECALL_LIMIT", "This ticket has reached the recall limit.");
    }

    const updated = await tx.$queryRaw<typeof rows>`
      UPDATE tickets
      SET call_count = call_count + 1
      WHERE id = ${current.id}::bigint
        AND status = 'SERVING'
      RETURNING
        id::text AS id,
        request_id,
        service_id,
        to_char(service_date, 'YYYY-MM-DD') AS service_date,
        seq,
        number,
        status::text AS status,
        counter_id,
        served_by,
        call_count,
        auto_closed,
        created_at,
        called_at,
        finished_at
    `;
    const row = updated[0];
    if (!row) {
      throw new QueueError("NO_ACTIVE_TICKET", "This counter has no ticket in service.");
    }
    const ticket = mapTicket(row);
    await recordEvent(tx, {
      ticketId: ticket.id,
      type: "RECALLED",
      notifyType: "TICKET_RECALLED",
      counterId: input.counterId,
      userId: input.userId,
      serviceId: ticket.serviceId,
    });
    return ticket;
  }, queueTransaction);
}
