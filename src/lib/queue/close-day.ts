import type { PrismaClient } from "@/generated/prisma/client";
import { appTimezone } from "@/lib/env";
import { assertLegalTransition } from "@/lib/queue/transitions";
import { queueTransaction, recordEvent, serviceDate } from "@/lib/queue/sql";
import type { ClockInput, CloseDayResult } from "@/lib/queue/types";

export async function closeDay(db: PrismaClient, input: ClockInput = {}): Promise<CloseDayResult> {
  const timeZone = input.timeZone ?? appTimezone();
  return db.$transaction(async (tx) => {
    const today = await serviceDate(tx, input.now, timeZone);
    assertLegalTransition("WAITING", "EXPIRED");
    const expired = await tx.$queryRaw<{ id: string; service_id: number }[]>`
      UPDATE tickets
      SET status = 'EXPIRED'
      WHERE status = 'WAITING'
        AND service_date < ${today}::date
      RETURNING id::text AS id, service_id
    `;
    for (const ticket of expired) {
      await recordEvent(tx, {
        ticketId: BigInt(ticket.id),
        type: "EXPIRED",
        notifyType: "TICKET_EXPIRED",
        serviceId: ticket.service_id,
      });
    }

    assertLegalTransition("SERVING", "DONE");
    const closed = await tx.$queryRaw<{ id: string; service_id: number; counter_id: number | null }[]>`
      UPDATE tickets
      SET status = 'DONE',
          auto_closed = true,
          finished_at = now()
      WHERE status = 'SERVING'
        AND service_date < ${today}::date
      RETURNING id::text AS id, service_id, counter_id
    `;
    for (const ticket of closed) {
      await recordEvent(tx, {
        ticketId: BigInt(ticket.id),
        type: "DONE",
        notifyType: "TICKET_DONE",
        counterId: ticket.counter_id,
        serviceId: ticket.service_id,
      });
    }

    return { expired: expired.length, autoClosed: closed.length };
  }, queueTransaction);
}
