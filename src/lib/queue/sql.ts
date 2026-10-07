import { randomUUID } from "node:crypto";
import { appTimezone } from "@/lib/env";
import { QueueError } from "@/lib/queue/errors";
import type { QueueTicket, TicketStatus } from "@/lib/queue/types";

export const queueTransaction = { maxWait: 20_000, timeout: 20_000 };

export type Sql = {
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
};

type TicketRow = {
  id: string;
  request_id: string;
  service_id: number;
  service_date: string;
  seq: number;
  number: string;
  status: TicketStatus;
  counter_id: number | null;
  served_by: number | null;
  call_count: number;
  auto_closed: boolean;
  created_at: Date;
  called_at: Date | null;
  finished_at: Date | null;
};

export function mapTicket(row: TicketRow): QueueTicket {
  return {
    id: BigInt(row.id),
    requestId: row.request_id,
    serviceId: row.service_id,
    serviceDate: row.service_date,
    seq: row.seq,
    number: row.number,
    status: row.status,
    counterId: row.counter_id,
    servedBy: row.served_by,
    callCount: row.call_count,
    autoClosed: row.auto_closed,
    createdAt: new Date(row.created_at),
    calledAt: row.called_at ? new Date(row.called_at) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
  };
}

export async function serviceDate(
  db: Sql,
  now: Date | undefined,
  timeZone = appTimezone(),
): Promise<string> {
  // Date values leave Prisma as zone-less timestamps and would follow the
  // database session clock. The ISO form keeps the instant in UTC.
  const rows = now
    ? await db.$queryRaw<{ service_date: string }[]>`
        SELECT to_char(${now.toISOString()}::timestamptz AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS service_date
      `
    : await db.$queryRaw<{ service_date: string }[]>`
        SELECT to_char(now() AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS service_date
      `;
  const date = rows[0]?.service_date;
  if (!date) {
    throw new QueueError("CLOCK_FAILED", "Could not resolve the queue date.");
  }
  return date;
}

export async function findTicketByRequestId(
  db: Sql,
  requestId: string,
): Promise<QueueTicket | null> {
  const found = await db.$queryRaw<TicketRow[]>`
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
    WHERE request_id = ${requestId}::uuid
  `;
  return found[0] ? mapTicket(found[0]) : null;
}

export async function aheadCount(db: Sql, ticket: QueueTicket): Promise<number> {
  const rows = await db.$queryRaw<{ ahead: number }[]>`
    SELECT count(*)::int AS ahead
    FROM tickets
    WHERE service_id = ${ticket.serviceId}
      AND service_date = ${ticket.serviceDate}::date
      AND status = 'WAITING'
      AND seq < ${ticket.seq}
  `;
  return rows[0]?.ahead ?? 0;
}

type CounterRow = {
  id: number;
  status: string;
  current_user_id: number | null;
  is_active: boolean;
};

export async function lockCounter(db: Sql, counterId: number, userId: number): Promise<void> {
  const rows = await db.$queryRaw<CounterRow[]>`
    SELECT id, status::text AS status, current_user_id, is_active
    FROM counters
    WHERE id = ${counterId}
    FOR UPDATE
  `;
  const counter = rows[0];
  if (!counter) {
    throw new QueueError("COUNTER_NOT_FOUND", "Counter does not exist.");
  }
  if (!counter.is_active) {
    throw new QueueError("COUNTER_INACTIVE", "Counter is inactive.");
  }
  if (counter.status !== "OPEN") {
    throw new QueueError("COUNTER_NOT_OPEN", "Counter is not open.");
  }
  if (counter.current_user_id !== userId) {
    throw new QueueError("COUNTER_NOT_HELD", "Counter is held by another officer.");
  }
}

export async function maxRecall(db: Sql): Promise<number> {
  const rows = await db.$queryRaw<{ value: unknown }[]>`
    SELECT value FROM settings WHERE key = 'max_recall'
  `;
  const value = rows[0]?.value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 3;
}

export async function recordEvent(
  db: Sql,
  event: {
    ticketId: bigint;
    type: "ISSUED" | "CALLED" | "RECALLED" | "DONE" | "NO_SHOW" | "EXPIRED";
    notifyType:
      | "TICKET_ISSUED"
      | "TICKET_CALLED"
      | "TICKET_RECALLED"
      | "TICKET_DONE"
      | "TICKET_NO_SHOW"
      | "TICKET_EXPIRED";
    counterId?: number | null;
    userId?: number | null;
    serviceId: number;
  },
): Promise<void> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO ticket_events (ticket_id, type, counter_id, user_id)
    VALUES (
      ${event.ticketId.toString()}::bigint,
      ${event.type},
      ${event.counterId ?? null},
      ${event.userId ?? null}
    )
    RETURNING id::text AS id
  `;
  const payload = JSON.stringify({
    id: rows[0]?.id,
    type: event.notifyType,
    ticketId: event.ticketId.toString(),
    counterId: event.counterId ?? null,
    serviceId: event.serviceId,
  });
  await db.$queryRaw`SELECT pg_notify('queue_events', ${payload})::text AS notified`;
}

export async function notifyQueue(
  db: Sql,
  event: {
    type: string;
    ticketId?: string | null;
    counterId?: number | null;
    serviceId?: number | null;
  },
): Promise<void> {
  const payload = JSON.stringify({
    id: randomUUID(),
    type: event.type,
    ticketId: event.ticketId ?? null,
    counterId: event.counterId ?? null,
    serviceId: event.serviceId ?? null,
  });
  await db.$queryRaw`SELECT pg_notify('queue_events', ${payload})::text AS notified`;
}

export function isRequestIdConflict(error: unknown): boolean {
  return errorText(error).includes("tickets_request_id_key");
}

export function errorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      message?: unknown;
      code?: unknown;
      meta?: unknown;
      cause?: unknown;
    };
    if (typeof record.message === "string") parts.push(record.message);
    if (typeof record.code === "string") parts.push(record.code);
    if (record.meta) parts.push(JSON.stringify(record.meta));
    current = record.cause;
  }
  if (error instanceof Error) parts.push(error.message);
  return parts.join(" ");
}

export async function takeNextWaiting(
  db: Sql,
  counterId: number,
  userId: number,
  today: string,
): Promise<QueueTicket | null> {
  const rows = await db.$queryRaw<TicketRow[]>`
    WITH next AS (
      SELECT id
      FROM tickets
      WHERE status = 'WAITING'
        AND service_date = ${today}::date
        AND service_id IN (
          SELECT service_id FROM counter_services WHERE counter_id = ${counterId}
        )
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE tickets AS ticket
    SET status = 'SERVING',
        counter_id = ${counterId},
        served_by = ${userId},
        called_at = now(),
        call_count = 1
    FROM next
    WHERE ticket.id = next.id
    RETURNING
      ticket.id::text AS id,
      ticket.request_id,
      ticket.service_id,
      to_char(ticket.service_date, 'YYYY-MM-DD') AS service_date,
      ticket.seq,
      ticket.number,
      ticket.status::text AS status,
      ticket.counter_id,
      ticket.served_by,
      ticket.call_count,
      ticket.auto_closed,
      ticket.created_at,
      ticket.called_at,
      ticket.finished_at
  `;
  return rows[0] ? mapTicket(rows[0]) : null;
}

export async function closeServing(
  db: Sql,
  counterId: number,
  nextStatus: "DONE" | "NO_SHOW",
): Promise<QueueTicket | null> {
  const rows = await db.$queryRaw<TicketRow[]>`
    UPDATE tickets
    SET status = ${nextStatus}::ticket_status,
        finished_at = now()
    WHERE counter_id = ${counterId}
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
  return rows[0] ? mapTicket(rows[0]) : null;
}
