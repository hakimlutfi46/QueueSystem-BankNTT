import type { PrismaClient } from "@/generated/prisma/client";
import { appTimezone } from "@/lib/env";
import { QueueError } from "@/lib/queue/errors";
import {
  aheadCount,
  findTicketByRequestId,
  isRequestIdConflict,
  mapTicket,
  queueTransaction,
  recordEvent,
  serviceDate,
  type Sql,
} from "@/lib/queue/sql";
import type { ClockInput, IssuedTicket, QueueTicket } from "@/lib/queue/types";

export type IssueTicketInput = ClockInput & {
  serviceId: number;
  requestId: string;
};

export async function issueTicket(db: PrismaClient, input: IssueTicketInput): Promise<IssuedTicket> {
  const timeZone = input.timeZone ?? appTimezone();
  try {
    return await db.$transaction(async (tx) => {
      const existing = await findTicketByRequestId(tx, input.requestId);
      if (existing) {
        return { ticket: existing, aheadCount: await aheadCount(tx, existing) };
      }
      const ticket = await createTicket(tx, input, timeZone);
      return { ticket, aheadCount: await aheadCount(tx, ticket) };
    }, queueTransaction);
  } catch (error) {
    if (!isRequestIdConflict(error)) {
      throw error;
    }
    const existing = await findTicketByRequestId(db, input.requestId);
    if (!existing) {
      throw error;
    }
    return { ticket: existing, aheadCount: await aheadCount(db, existing) };
  }
}

async function createTicket(db: Sql, input: IssueTicketInput, timeZone: string): Promise<QueueTicket> {
  const services = await db.$queryRaw<{ id: number; prefix: string; is_active: boolean }[]>`
    SELECT id, prefix, is_active
    FROM services
    WHERE id = ${input.serviceId}
  `;
  const service = services[0];
  if (!service) {
    throw new QueueError("SERVICE_NOT_FOUND", "Service does not exist.");
  }
  if (!service.is_active) {
    throw new QueueError("SERVICE_INACTIVE", "Service is inactive.");
  }

  const today = await serviceDate(db, input.now, timeZone);
  const sequences = await db.$queryRaw<{ last_number: number }[]>`
    INSERT INTO daily_sequences (service_id, service_date, last_number)
    VALUES (${service.id}, ${today}::date, 1)
    ON CONFLICT (service_id, service_date)
    DO UPDATE SET last_number = daily_sequences.last_number + 1
    RETURNING last_number
  `;
  const seq = sequences[0]?.last_number;
  if (!seq) {
    throw new QueueError("SEQUENCE_FAILED", "Could not allocate a ticket number.");
  }
  const number = `${service.prefix}${String(seq).padStart(3, "0")}`;
  const rows = await db.$queryRaw<
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
    INSERT INTO tickets (request_id, service_id, service_date, seq, number)
    VALUES (
      ${input.requestId}::uuid,
      ${service.id},
      ${today}::date,
      ${seq},
      ${number}
    )
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
  const ticket = rows[0];
  if (!ticket) {
    throw new QueueError("TICKET_FAILED", "Could not create the ticket.");
  }
  const mapped = mapTicket(ticket);
  await recordEvent(db, {
    ticketId: mapped.id,
    type: "ISSUED",
    notifyType: "TICKET_ISSUED",
    serviceId: mapped.serviceId,
  });
  return mapped;
}
