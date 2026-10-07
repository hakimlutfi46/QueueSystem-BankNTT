import type { PrismaClient } from "@/generated/prisma/client";
import { QueueError } from "@/lib/queue/errors";
import { notifyQueue, queueTransaction, type Sql } from "@/lib/queue/sql";

type CounterRow = {
  id: number;
  status: string;
  current_user_id: number | null;
  is_active: boolean;
};

export async function openCounter(
  db: PrismaClient,
  input: { counterId: number; userId: number },
): Promise<{ id: number; status: "OPEN" }> {
  return db.$transaction(async (tx) => {
    const counter = await lockCounter(tx, input.counterId);
    if (
      counter.current_user_id != null &&
      counter.current_user_id !== input.userId &&
      counter.status !== "CLOSED"
    ) {
      throw new QueueError("COUNTER_IN_USE", "Counter is already in use.");
    }

    const held = await tx.$queryRaw<{ id: number }[]>`
      SELECT id
      FROM counters
      WHERE current_user_id = ${input.userId}
        AND id <> ${input.counterId}
        AND status IN ('OPEN', 'PAUSED')
      LIMIT 1
    `;
    if (held[0]) {
      throw new QueueError("COUNTER_ALREADY_HELD", "This officer already holds a counter.");
    }

    await tx.$executeRaw`
      UPDATE counters
      SET status = 'OPEN', current_user_id = ${input.userId}
      WHERE id = ${input.counterId}
    `;
    await notifyQueue(tx, { type: "COUNTER_CHANGED", counterId: input.counterId });
    return { id: input.counterId, status: "OPEN" };
  }, queueTransaction);
}

export async function pauseCounter(
  db: PrismaClient,
  input: { counterId: number; userId: number },
): Promise<{ id: number; status: "PAUSED" }> {
  return db.$transaction(async (tx) => {
    const counter = await lockHeldCounter(tx, input);
    if (counter.status === "PAUSED") {
      return { id: input.counterId, status: "PAUSED" };
    }
    if (counter.status !== "OPEN") {
      throw new QueueError("COUNTER_NOT_OPEN", "Counter is not open.");
    }
    await assertNotServing(tx, input.counterId);
    await tx.$executeRaw`
      UPDATE counters SET status = 'PAUSED' WHERE id = ${input.counterId}
    `;
    await notifyQueue(tx, { type: "COUNTER_CHANGED", counterId: input.counterId });
    return { id: input.counterId, status: "PAUSED" };
  }, queueTransaction);
}

export async function closeCounter(
  db: PrismaClient,
  input: { counterId: number; userId: number },
): Promise<{ id: number; status: "CLOSED" }> {
  return db.$transaction(async (tx) => {
    const counter = await lockCounter(tx, input.counterId);
    if (counter.status === "CLOSED") {
      return { id: input.counterId, status: "CLOSED" };
    }
    if (counter.current_user_id !== input.userId) {
      throw new QueueError("COUNTER_NOT_HELD", "Counter is held by another officer.");
    }
    await assertNotServing(tx, input.counterId);
    await tx.$executeRaw`
      UPDATE counters
      SET status = 'CLOSED', current_user_id = NULL
      WHERE id = ${input.counterId}
    `;
    await notifyQueue(tx, { type: "COUNTER_CHANGED", counterId: input.counterId });
    return { id: input.counterId, status: "CLOSED" };
  }, queueTransaction);
}

async function lockCounter(tx: Sql, counterId: number): Promise<CounterRow> {
  const rows = await tx.$queryRaw<CounterRow[]>`
    SELECT id, status::text AS status, current_user_id, is_active
    FROM counters
    WHERE id = ${counterId}
    FOR UPDATE
  `;
  const counter = rows[0];
  if (!counter) throw new QueueError("COUNTER_NOT_FOUND", "Counter does not exist.");
  if (!counter.is_active) throw new QueueError("COUNTER_INACTIVE", "Counter is inactive.");
  return counter;
}

async function lockHeldCounter(
  tx: Sql,
  input: { counterId: number; userId: number },
): Promise<CounterRow> {
  const counter = await lockCounter(tx, input.counterId);
  if (counter.current_user_id !== input.userId) {
    throw new QueueError("COUNTER_NOT_HELD", "Counter is held by another officer.");
  }
  return counter;
}

async function assertNotServing(tx: Sql, counterId: number): Promise<void> {
  const serving = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id
    FROM tickets
    WHERE counter_id = ${counterId} AND status = 'SERVING'
    LIMIT 1
  `;
  if (serving[0]) {
    throw new QueueError("COUNTER_BUSY", "Finish the current ticket before leaving the counter.");
  }
}
