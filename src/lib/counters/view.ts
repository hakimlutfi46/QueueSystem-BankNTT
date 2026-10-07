import type { PrismaClient } from "@/generated/prisma/client";
import type { CounterChoice, CounterDesk, DeskTicket, RecentTicket } from "@/lib/counters/types";
import { serviceDate } from "@/lib/queue/sql";

type CounterRow = {
  id: number;
  name: string;
  display_number: number;
  status: string;
  officer_id: number | null;
  officer_name: string | null;
};

export async function loadCounterDesk(db: PrismaClient, userId: number): Promise<CounterDesk> {
  const today = await serviceDate(db, undefined);
  const settings = await readSettings(db);
  const counters = await db.$queryRaw<CounterRow[]>`
    SELECT
      counter.id,
      counter.name,
      counter.display_number,
      counter.status::text AS status,
      counter.current_user_id AS officer_id,
      officer.name AS officer_name
    FROM counters AS counter
    LEFT JOIN users AS officer ON officer.id = counter.current_user_id
    WHERE counter.is_active
    ORDER BY counter.display_number, counter.id
  `;
  const links = await db.$queryRaw<{ counter_id: number; service_name: string }[]>`
    SELECT link.counter_id, service.name AS service_name
    FROM counter_services AS link
    JOIN services AS service ON service.id = link.service_id
    ORDER BY service.sort_order, service.id
  `;
  const names = new Map<number, string[]>();
  for (const link of links) {
    const current = names.get(link.counter_id) ?? [];
    current.push(link.service_name);
    names.set(link.counter_id, current);
  }

  const held = counters.find(
    (counter) =>
      counter.officer_id === userId && (counter.status === "OPEN" || counter.status === "PAUSED"),
  );
  if (!held || (held.status !== "OPEN" && held.status !== "PAUSED")) {
    return {
      mode: "pick",
      branchName: settings.branchName,
      counters: counters.map((counter) => toChoice(counter, names, userId)),
    };
  }

  const activeRows = await db.$queryRaw<
    { id: string; number: string; service_name: string; called_at: Date | null; call_count: number }[]
  >`
    SELECT ticket.id::text AS id, ticket.number, service.name AS service_name, ticket.called_at, ticket.call_count
    FROM tickets AS ticket
    JOIN services AS service ON service.id = ticket.service_id
    WHERE ticket.counter_id = ${held.id} AND ticket.status = 'SERVING'
    LIMIT 1
  `;
  const waiting = await db.$queryRaw<{ waiting_count: number }[]>`
    SELECT count(*)::int AS waiting_count
    FROM tickets
    WHERE status = 'WAITING'
      AND service_date = ${today}::date
      AND service_id IN (
        SELECT service_id FROM counter_services WHERE counter_id = ${held.id}
      )
  `;

  return {
    mode: "desk",
    branchName: settings.branchName,
    targetServiceMinutes: settings.targetServiceMinutes,
    counter: {
      id: held.id,
      name: held.name,
      displayNumber: held.display_number,
      status: held.status,
      serviceNames: names.get(held.id) ?? [],
    },
    activeTicket: mapActive(activeRows[0]),
    waitingCount: Number(waiting[0]?.waiting_count ?? 0),
    recent: await loadRecentTickets(db, held.id, today),
  };
}

export async function loadRecentTickets(
  db: PrismaClient,
  counterId: number,
  serviceDay?: string,
): Promise<RecentTicket[]> {
  const today = serviceDay ?? (await serviceDate(db, undefined));
  const rows = await db.$queryRaw<
    {
      id: string;
      number: string;
      service_name: string;
      status: string;
      handling_seconds: number | null;
    }[]
  >`
    SELECT
      ticket.id::text AS id,
      ticket.number,
      service.name AS service_name,
      ticket.status::text AS status,
      CASE
        WHEN ticket.called_at IS NULL OR ticket.finished_at IS NULL THEN NULL
        ELSE floor(extract(epoch FROM (ticket.finished_at - ticket.called_at)))::int
      END AS handling_seconds
    FROM tickets AS ticket
    JOIN services AS service ON service.id = ticket.service_id
    WHERE ticket.counter_id = ${counterId}
      AND ticket.service_date = ${today}::date
      AND ticket.status IN ('DONE', 'NO_SHOW')
    ORDER BY ticket.finished_at DESC NULLS LAST, ticket.id DESC
    LIMIT 10
  `;
  return rows.flatMap((row) => {
    if (row.status !== "DONE" && row.status !== "NO_SHOW") return [];
    return [
      {
        id: row.id,
        number: row.number,
        serviceName: row.service_name,
        status: row.status,
        handlingSeconds: row.handling_seconds,
      },
    ];
  });
}

function toChoice(
  counter: CounterRow,
  names: Map<number, string[]>,
  userId: number,
): CounterChoice {
  const status = counterStatus(counter.status);
  return {
    id: counter.id,
    name: counter.name,
    displayNumber: counter.display_number,
    status,
    officerId: counter.officer_id,
    officerName: counter.officer_name,
    available: status === "CLOSED" || counter.officer_id === userId,
    serviceNames: names.get(counter.id) ?? [],
  };
}

function mapActive(
  row:
    | {
        id: string;
        number: string;
        service_name: string;
        called_at: Date | null;
        call_count: number;
      }
    | undefined,
): DeskTicket | null {
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    serviceName: row.service_name,
    calledAt: row.called_at ? new Date(row.called_at).toISOString() : null,
    callCount: Number(row.call_count),
  };
}

function counterStatus(status: string): CounterChoice["status"] {
  if (status === "OPEN" || status === "PAUSED" || status === "CLOSED") return status;
  return "CLOSED";
}

async function readSettings(
  db: PrismaClient,
): Promise<{ branchName: string; targetServiceMinutes: number }> {
  const rows = await db.$queryRaw<{ key: string; value: unknown }[]>`
    SELECT key, value FROM settings WHERE key IN ('branch_name', 'target_service_minutes')
  `;
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const branchName = values.get("branch_name");
  return {
    branchName: typeof branchName === "string" ? branchName : "Bank NTT",
    targetServiceMinutes: numberSetting(values.get("target_service_minutes"), 10),
  };
}

function numberSetting(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}
