import type { PrismaClient } from "@/generated/prisma/client";
import { appTimezone } from "@/lib/env";
import { assertRange, isIsoDate } from "@/lib/reports/dates";
import type {
  CounterRecap,
  DailyReport,
  HourBucket,
  RangeDay,
  RangeReport,
  ReportTotals,
  ServiceRecap,
  TicketDetail,
} from "@/lib/reports/types";
import { AdminError } from "@/lib/admin/errors";

type StatsRow = {
  total: number;
  done: number;
  no_show: number;
  expired: number;
  average_wait: number | null;
  max_wait: number | null;
  average_handle: number | null;
  max_handle: number | null;
};

export async function loadDailyReport(db: PrismaClient, date: string): Promise<DailyReport> {
  if (!isIsoDate(date)) throw new AdminError("VALIDATION", "Tanggal tidak valid.");
  const timeZone = appTimezone();
  const [totals, services, counters, hours, tickets] = await Promise.all([
    dailyTotals(db, date),
    serviceRecap(db, date),
    counterRecap(db, date),
    hourBuckets(db, date, timeZone),
    ticketDetails(db, date, timeZone),
  ]);
  return { date, timeZone, totals, services, counters, hours, tickets };
}

export async function loadRangeReport(db: PrismaClient, from: string, to: string): Promise<RangeReport> {
  assertRange(from, to);
  const timeZone = appTimezone();
  const [days, totals] = await Promise.all([rangeDays(db, from, to), rangeTotals(db, from, to)]);
  return { from, to, timeZone, days, totals };
}

function mapTotals(row: StatsRow | undefined): ReportTotals {
  return {
    total: Number(row?.total ?? 0),
    done: Number(row?.done ?? 0),
    noShow: Number(row?.no_show ?? 0),
    expired: Number(row?.expired ?? 0),
    wait: {
      averageSeconds: roundSeconds(row?.average_wait),
      maxSeconds: roundSeconds(row?.max_wait),
    },
    handle: {
      averageSeconds: roundSeconds(row?.average_handle),
      maxSeconds: roundSeconds(row?.max_handle),
    },
  };
}

function roundSeconds(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value));
}

async function dailyTotals(db: PrismaClient, date: string): Promise<ReportTotals> {
  const rows = await db.$queryRaw<StatsRow[]>`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'DONE')::int AS done,
      count(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show,
      count(*) FILTER (WHERE status = 'EXPIRED')::int AS expired,
      avg(extract(epoch FROM (called_at - created_at)))
        FILTER (WHERE called_at IS NOT NULL AND auto_closed = false) AS average_wait,
      max(extract(epoch FROM (called_at - created_at)))
        FILTER (WHERE called_at IS NOT NULL) AS max_wait,
      avg(extract(epoch FROM (finished_at - called_at)))
        FILTER (
          WHERE status = 'DONE'
            AND called_at IS NOT NULL
            AND finished_at IS NOT NULL
            AND auto_closed = false
        ) AS average_handle,
      max(extract(epoch FROM (finished_at - called_at)))
        FILTER (
          WHERE status = 'DONE'
            AND called_at IS NOT NULL
            AND finished_at IS NOT NULL
        ) AS max_handle
    FROM tickets
    WHERE service_date = ${date}::date
  `;
  return mapTotals(rows[0]);
}

async function serviceRecap(db: PrismaClient, date: string): Promise<ServiceRecap[]> {
  const rows = await db.$queryRaw<(StatsRow & { service_id: number; service_name: string })[]>`
    SELECT
      s.id AS service_id,
      s.name AS service_name,
      count(*)::int AS total,
      count(*) FILTER (WHERE t.status = 'DONE')::int AS done,
      count(*) FILTER (WHERE t.status = 'NO_SHOW')::int AS no_show,
      count(*) FILTER (WHERE t.status = 'EXPIRED')::int AS expired,
      avg(extract(epoch FROM (t.called_at - t.created_at)))
        FILTER (WHERE t.called_at IS NOT NULL AND t.auto_closed = false) AS average_wait,
      max(extract(epoch FROM (t.called_at - t.created_at)))
        FILTER (WHERE t.called_at IS NOT NULL) AS max_wait,
      avg(extract(epoch FROM (t.finished_at - t.called_at)))
        FILTER (
          WHERE t.status = 'DONE'
            AND t.called_at IS NOT NULL
            AND t.finished_at IS NOT NULL
            AND t.auto_closed = false
        ) AS average_handle,
      max(extract(epoch FROM (t.finished_at - t.called_at)))
        FILTER (
          WHERE t.status = 'DONE'
            AND t.called_at IS NOT NULL
            AND t.finished_at IS NOT NULL
        ) AS max_handle
    FROM tickets t
    JOIN services s ON s.id = t.service_id
    WHERE t.service_date = ${date}::date
    GROUP BY s.id, s.name
    ORDER BY s.name, s.id
  `;
  return rows.map((row) => ({
    serviceId: Number(row.service_id),
    serviceName: row.service_name,
    ...mapTotals(row),
  }));
}

async function counterRecap(db: PrismaClient, date: string): Promise<CounterRecap[]> {
  const rows = await db.$queryRaw<
    (StatsRow & { counter_id: number; counter_name: string; officer_name: string })[]
  >`
    SELECT
      c.id AS counter_id,
      c.name AS counter_name,
      COALESCE(u.name, '—') AS officer_name,
      count(*)::int AS total,
      count(*) FILTER (WHERE t.status = 'DONE')::int AS done,
      count(*) FILTER (WHERE t.status = 'NO_SHOW')::int AS no_show,
      count(*) FILTER (WHERE t.status = 'EXPIRED')::int AS expired,
      avg(extract(epoch FROM (t.called_at - t.created_at)))
        FILTER (WHERE t.called_at IS NOT NULL AND t.auto_closed = false) AS average_wait,
      max(extract(epoch FROM (t.called_at - t.created_at)))
        FILTER (WHERE t.called_at IS NOT NULL) AS max_wait,
      avg(extract(epoch FROM (t.finished_at - t.called_at)))
        FILTER (
          WHERE t.status = 'DONE'
            AND t.called_at IS NOT NULL
            AND t.finished_at IS NOT NULL
            AND t.auto_closed = false
        ) AS average_handle,
      max(extract(epoch FROM (t.finished_at - t.called_at)))
        FILTER (
          WHERE t.status = 'DONE'
            AND t.called_at IS NOT NULL
            AND t.finished_at IS NOT NULL
        ) AS max_handle
    FROM tickets t
    JOIN counters c ON c.id = t.counter_id
    LEFT JOIN users u ON u.id = t.served_by
    WHERE t.service_date = ${date}::date
    GROUP BY c.id, c.name, c.display_number, u.id, u.name
    ORDER BY c.display_number, u.name
  `;
  return rows.map((row) => ({
    counterId: Number(row.counter_id),
    counterName: row.counter_name,
    officerName: row.officer_name,
    ...mapTotals(row),
  }));
}

async function hourBuckets(db: PrismaClient, date: string, timeZone: string): Promise<HourBucket[]> {
  const rows = await db.$queryRaw<{ hour: number; count: number }[]>`
    SELECT extract(hour FROM created_at AT TIME ZONE ${timeZone})::int AS hour, count(*)::int AS count
    FROM tickets
    WHERE service_date = ${date}::date
    GROUP BY 1
  `;
  const counts = new Map(rows.map((row) => [Number(row.hour), Number(row.count)]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, count: counts.get(hour) ?? 0 }));
}

async function ticketDetails(db: PrismaClient, date: string, timeZone: string): Promise<TicketDetail[]> {
  const rows = await db.$queryRaw<
    {
      number: string;
      service_name: string;
      counter_name: string | null;
      officer_name: string | null;
      created_at: string;
      called_at: string | null;
      finished_at: string | null;
      wait_seconds: number | null;
      handle_seconds: number | null;
      call_count: number;
      status: string;
      auto_closed: boolean;
    }[]
  >`
    SELECT
      t.number,
      s.name AS service_name,
      c.name AS counter_name,
      u.name AS officer_name,
      to_char(t.created_at AT TIME ZONE ${timeZone}, 'HH24:MI:SS') AS created_at,
      CASE
        WHEN t.called_at IS NULL THEN NULL
        ELSE to_char(t.called_at AT TIME ZONE ${timeZone}, 'HH24:MI:SS')
      END AS called_at,
      CASE
        WHEN t.finished_at IS NULL THEN NULL
        ELSE to_char(t.finished_at AT TIME ZONE ${timeZone}, 'HH24:MI:SS')
      END AS finished_at,
      CASE
        WHEN t.called_at IS NULL THEN NULL
        ELSE round(extract(epoch FROM (t.called_at - t.created_at)))::int
      END AS wait_seconds,
      CASE
        WHEN t.status = 'DONE' AND t.called_at IS NOT NULL AND t.finished_at IS NOT NULL
          THEN round(extract(epoch FROM (t.finished_at - t.called_at)))::int
        ELSE NULL
      END AS handle_seconds,
      t.call_count,
      t.status::text AS status,
      t.auto_closed
    FROM tickets t
    JOIN services s ON s.id = t.service_id
    LEFT JOIN counters c ON c.id = t.counter_id
    LEFT JOIN users u ON u.id = t.served_by
    WHERE t.service_date = ${date}::date
    ORDER BY t.created_at, t.id
  `;
  return rows.map((row) => ({
    number: row.number,
    serviceName: row.service_name,
    counterName: row.counter_name,
    officerName: row.officer_name,
    createdAt: row.created_at,
    calledAt: row.called_at,
    finishedAt: row.finished_at,
    waitSeconds: row.wait_seconds == null ? null : Number(row.wait_seconds),
    handleSeconds: row.handle_seconds == null ? null : Number(row.handle_seconds),
    callCount: Number(row.call_count),
    status: row.status,
    autoClosed: row.auto_closed,
  }));
}

async function rangeDays(db: PrismaClient, from: string, to: string): Promise<RangeDay[]> {
  const rows = await db.$queryRaw<(StatsRow & { service_date: string })[]>`
    SELECT
      to_char(d::date, 'YYYY-MM-DD') AS service_date,
      count(t.id)::int AS total,
      count(t.id) FILTER (WHERE t.status = 'DONE')::int AS done,
      count(t.id) FILTER (WHERE t.status = 'NO_SHOW')::int AS no_show,
      count(t.id) FILTER (WHERE t.status = 'EXPIRED')::int AS expired,
      avg(extract(epoch FROM (t.called_at - t.created_at)))
        FILTER (WHERE t.called_at IS NOT NULL AND t.auto_closed = false) AS average_wait,
      max(extract(epoch FROM (t.called_at - t.created_at)))
        FILTER (WHERE t.called_at IS NOT NULL) AS max_wait,
      avg(extract(epoch FROM (t.finished_at - t.called_at)))
        FILTER (
          WHERE t.status = 'DONE'
            AND t.called_at IS NOT NULL
            AND t.finished_at IS NOT NULL
            AND t.auto_closed = false
        ) AS average_handle,
      max(extract(epoch FROM (t.finished_at - t.called_at)))
        FILTER (
          WHERE t.status = 'DONE'
            AND t.called_at IS NOT NULL
            AND t.finished_at IS NOT NULL
        ) AS max_handle
    FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d
    LEFT JOIN tickets t ON t.service_date = d::date
    GROUP BY d
    ORDER BY d
  `;
  return rows.map((row) => ({ date: row.service_date, ...mapTotals(row) }));
}

async function rangeTotals(db: PrismaClient, from: string, to: string): Promise<ReportTotals> {
  const rows = await db.$queryRaw<StatsRow[]>`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'DONE')::int AS done,
      count(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show,
      count(*) FILTER (WHERE status = 'EXPIRED')::int AS expired,
      avg(extract(epoch FROM (called_at - created_at)))
        FILTER (WHERE called_at IS NOT NULL AND auto_closed = false) AS average_wait,
      max(extract(epoch FROM (called_at - created_at)))
        FILTER (WHERE called_at IS NOT NULL) AS max_wait,
      avg(extract(epoch FROM (finished_at - called_at)))
        FILTER (
          WHERE status = 'DONE'
            AND called_at IS NOT NULL
            AND finished_at IS NOT NULL
            AND auto_closed = false
        ) AS average_handle,
      max(extract(epoch FROM (finished_at - called_at)))
        FILTER (
          WHERE status = 'DONE'
            AND called_at IS NOT NULL
            AND finished_at IS NOT NULL
        ) AS max_handle
    FROM tickets
    WHERE service_date BETWEEN ${from}::date AND ${to}::date
  `;
  return mapTotals(rows[0]);
}
