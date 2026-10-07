import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { serviceDate } from "@/lib/queue/sql";
import type {
  QueueActiveTicket,
  QueueCounterState,
  QueueDisplaySettings,
  QueueLastCall,
  QueueState,
} from "@/lib/realtime/types";

const DEFAULT_SETTINGS: QueueDisplaySettings = {
  branchName: "Bank NTT",
  runningText: "",
  voiceEnabled: true,
  maxRecall: 3,
  targetServiceMinutes: 10,
  ticketFooter: "",
  ticketWidthMm: 80,
};

export async function loadQueueState(db: PrismaClient = getPrisma()): Promise<QueueState> {
  return db.$transaction(async (tx) => {
    const today = await serviceDate(tx, undefined);
    const services = await tx.$queryRaw<
        { id: number; name: string; prefix: string; waiting_count: number }[]
      >`
        SELECT
          s.id,
          s.name,
          s.prefix,
          (
            SELECT count(*)::int
            FROM tickets AS ticket
            WHERE ticket.service_id = s.id
              AND ticket.status = 'WAITING'
              AND ticket.service_date = ${today}::date
          ) AS waiting_count
        FROM services AS s
        WHERE s.is_active
        ORDER BY s.sort_order, s.id
      `;
    const counters = await tx.$queryRaw<
        {
          id: number;
          name: string;
          display_number: number;
          status: string;
          officer_id: number | null;
          officer_name: string | null;
        }[]
      >`
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
    const links = await tx.$queryRaw<{ counter_id: number; service_id: number }[]>`
        SELECT counter_id, service_id
        FROM counter_services
        ORDER BY service_id
      `;
    const serving = await tx.$queryRaw<
        {
          id: string;
          number: string;
          service_id: number;
          counter_id: number | null;
          call_count: number;
          called_at: Date | null;
        }[]
      >`
        SELECT
          id::text AS id,
          number,
          service_id,
          counter_id,
          call_count,
          called_at
        FROM tickets
        WHERE status = 'SERVING'
      `;
    const calls = await tx.$queryRaw<
        {
          id: string;
          type: string;
          ticket_id: string;
          number: string;
          service_id: number;
          counter_id: number | null;
          counter_name: string | null;
          display_number: number | null;
          called_at: Date | null;
        }[]
      >`
        SELECT
          event.id::text AS id,
          event.type,
          ticket.id::text AS ticket_id,
          ticket.number,
          ticket.service_id,
          event.counter_id,
          counter.name AS counter_name,
          counter.display_number,
          ticket.called_at
        FROM ticket_events AS event
        JOIN tickets AS ticket ON ticket.id = event.ticket_id
        LEFT JOIN counters AS counter ON counter.id = event.counter_id
        WHERE event.type IN ('CALLED', 'RECALLED')
          AND ticket.service_date = ${today}::date
        ORDER BY event.created_at DESC, event.id DESC
        LIMIT 1
      `;
    const settings = await tx.$queryRaw<{ key: string; value: unknown }[]>`
      SELECT key, value FROM settings
    `;
    const clock = await tx.$queryRaw<{ as_of: Date }[]>`
      SELECT now() AS as_of
    `;

    const servicesByCounter = new Map<number, number[]>();
    for (const link of links) {
      const current = servicesByCounter.get(link.counter_id) ?? [];
      current.push(link.service_id);
      servicesByCounter.set(link.counter_id, current);
    }

    const activeByCounter = new Map<number, QueueActiveTicket>();
    for (const ticket of serving) {
      if (ticket.counter_id == null) continue;
      activeByCounter.set(ticket.counter_id, {
        id: ticket.id,
        number: ticket.number,
        serviceId: ticket.service_id,
        callCount: Number(ticket.call_count),
        calledAt: toIso(ticket.called_at),
      });
    }

    const asOf = clock[0]?.as_of ?? new Date();
    return {
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        prefix: service.prefix,
        waitingCount: Number(service.waiting_count),
      })),
      counters: counters.map((counter) => ({
        id: counter.id,
        name: counter.name,
        displayNumber: counter.display_number,
        status: counterStatus(counter.status),
        officerId: counter.officer_id,
        officerName: counter.officer_name,
        serviceIds: servicesByCounter.get(counter.id) ?? [],
        activeTicket: activeByCounter.get(counter.id) ?? null,
      })),
      lastCall: mapLastCall(calls[0]),
      settings: mapSettings(settings),
      asOf: asOf.toISOString(),
    };
  });
}

function counterStatus(status: string): QueueCounterState["status"] {
  if (status === "OPEN" || status === "PAUSED" || status === "CLOSED") return status;
  return "CLOSED";
}

function mapLastCall(
  row:
    | {
        id: string;
        type: string;
        ticket_id: string;
        number: string;
        service_id: number;
        counter_id: number | null;
        counter_name: string | null;
        display_number: number | null;
        called_at: Date | null;
      }
    | undefined,
): QueueLastCall | null {
  if (!row) return null;
  if (row.type !== "CALLED" && row.type !== "RECALLED") return null;
  return {
    id: row.id,
    type: row.type === "CALLED" ? "TICKET_CALLED" : "TICKET_RECALLED",
    ticketId: row.ticket_id,
    ticketNumber: row.number,
    serviceId: row.service_id,
    counterId: row.counter_id,
    counterName: row.counter_name,
    displayNumber: row.display_number,
    calledAt: toIso(row.called_at),
  };
}

function mapSettings(rows: { key: string; value: unknown }[]): QueueDisplaySettings {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    branchName: asString(values.get("branch_name"), DEFAULT_SETTINGS.branchName),
    runningText: asString(values.get("running_text"), DEFAULT_SETTINGS.runningText),
    voiceEnabled: asBoolean(values.get("voice_enabled"), DEFAULT_SETTINGS.voiceEnabled),
    maxRecall: asNumber(values.get("max_recall"), DEFAULT_SETTINGS.maxRecall),
    targetServiceMinutes: asNumber(
      values.get("target_service_minutes"),
      DEFAULT_SETTINGS.targetServiceMinutes,
    ),
    ticketFooter: asString(values.get("ticket_footer"), DEFAULT_SETTINGS.ticketFooter),
    ticketWidthMm: asNumber(values.get("ticket_width_mm"), DEFAULT_SETTINGS.ticketWidthMm),
  };
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
