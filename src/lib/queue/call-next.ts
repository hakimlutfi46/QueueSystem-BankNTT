import type { PrismaClient } from "@/generated/prisma/client";
import { appTimezone } from "@/lib/env";
import { QueueError } from "@/lib/queue/errors";
import { assertLegalTransition } from "@/lib/queue/transitions";
import {
  closeServing,
  lockCounter,
  recordEvent,
  queueTransaction,
  serviceDate,
  takeNextWaiting,
  type Sql,
} from "@/lib/queue/sql";
import type { CallNextResult, CounterActionInput } from "@/lib/queue/types";

export async function callNext(db: PrismaClient, input: CounterActionInput): Promise<CallNextResult> {
  const timeZone = input.timeZone ?? appTimezone();
  return db.$transaction(async (tx) => {
    await lockCounter(tx, input.counterId, input.userId);
    const today = await serviceDate(tx, input.now, timeZone);

    assertLegalTransition("SERVING", "DONE");
    const finished = await closeServing(tx, input.counterId, "DONE");
    if (finished) {
      await recordEvent(tx, {
        ticketId: finished.id,
        type: "DONE",
        notifyType: "TICKET_DONE",
        counterId: input.counterId,
        userId: input.userId,
        serviceId: finished.serviceId,
      });
    }

    assertLegalTransition("WAITING", "SERVING");
    const called = await takeNextWaiting(tx, input.counterId, input.userId, today);
    if (called) {
      await recordEvent(tx, {
        ticketId: called.id,
        type: "CALLED",
        notifyType: "TICKET_CALLED",
        counterId: input.counterId,
        userId: input.userId,
        serviceId: called.serviceId,
      });
    }

    return { finished, called };
  }, queueTransaction);
}

export async function finishTicket(
  db: PrismaClient,
  input: CounterActionInput,
): Promise<CallNextResult["finished"]> {
  return db.$transaction(
    async (tx) => closeAs(tx, input, "DONE", "DONE", "TICKET_DONE"),
    queueTransaction,
  );
}

export async function markNoShow(db: PrismaClient, input: CounterActionInput): Promise<CallNextResult> {
  const timeZone = input.timeZone ?? appTimezone();
  return db.$transaction(async (tx) => {
    const finished = await closeAs(tx, input, "NO_SHOW", "NO_SHOW", "TICKET_NO_SHOW");
    const today = await serviceDate(tx, input.now, timeZone);
    assertLegalTransition("WAITING", "SERVING");
    const called = await takeNextWaiting(tx, input.counterId, input.userId, today);
    if (called) {
      await recordEvent(tx, {
        ticketId: called.id,
        type: "CALLED",
        notifyType: "TICKET_CALLED",
        counterId: input.counterId,
        userId: input.userId,
        serviceId: called.serviceId,
      });
    }
    return { finished, called };
  }, queueTransaction);
}

async function closeAs(
  db: Sql,
  input: CounterActionInput,
  status: "DONE" | "NO_SHOW",
  eventType: "DONE" | "NO_SHOW",
  notifyType: "TICKET_DONE" | "TICKET_NO_SHOW",
) {
  await lockCounter(db, input.counterId, input.userId);
  assertLegalTransition("SERVING", status);
  const finished = await closeServing(db, input.counterId, status);
  if (!finished) {
    throw new QueueError("NO_ACTIVE_TICKET", "This counter has no ticket in service.");
  }
  await recordEvent(db, {
    ticketId: finished.id,
    type: eventType,
    notifyType,
    counterId: input.counterId,
    userId: input.userId,
    serviceId: finished.serviceId,
  });
  return finished;
}
