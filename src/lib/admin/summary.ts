import type { PrismaClient } from "@/generated/prisma/client";
import { serviceDate } from "@/lib/queue/sql";

export type DaySummary = {
  total: number;
  waiting: number;
  serving: number;
  done: number;
  noShow: number;
  averageWaitSeconds: number | null;
  averageHandleSeconds: number | null;
};

export async function loadDaySummary(db: PrismaClient): Promise<DaySummary> {
  const today = await serviceDate(db, undefined);
  const rows = await db.$queryRaw<
    {
      total: number;
      waiting: number;
      serving: number;
      done: number;
      no_show: number;
      average_wait: number | null;
      average_handle: number | null;
    }[]
  >`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'WAITING')::int AS waiting,
      count(*) FILTER (WHERE status = 'SERVING')::int AS serving,
      count(*) FILTER (WHERE status = 'DONE')::int AS done,
      count(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show,
      avg(extract(epoch FROM (called_at - created_at)))
        FILTER (WHERE called_at IS NOT NULL AND auto_closed = false) AS average_wait,
      avg(extract(epoch FROM (finished_at - called_at)))
        FILTER (
          WHERE status = 'DONE'
            AND called_at IS NOT NULL
            AND finished_at IS NOT NULL
            AND auto_closed = false
        ) AS average_handle
    FROM tickets
    WHERE service_date = ${today}::date
  `;
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    waiting: Number(row?.waiting ?? 0),
    serving: Number(row?.serving ?? 0),
    done: Number(row?.done ?? 0),
    noShow: Number(row?.no_show ?? 0),
    averageWaitSeconds: roundSeconds(row?.average_wait),
    averageHandleSeconds: roundSeconds(row?.average_handle),
  };
}

function roundSeconds(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value));
}
