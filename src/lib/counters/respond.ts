import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { closeCounter, openCounter, pauseCounter } from "@/lib/queue/desk";
import { QueueError, callNext, finishTicket, markNoShow, recallTicket } from "@/lib/queue";
import { ensureDayClosed } from "@/lib/queue/day-close";
import type { QueueTicket } from "@/lib/queue/types";

const actions = ["open", "pause", "close", "next", "recall", "finish", "no-show"] as const;

const clientErrors: Record<string, { status: number; message: string }> = {
  COUNTER_NOT_FOUND: { status: 404, message: "Loket tidak ditemukan." },
  COUNTER_INACTIVE: { status: 409, message: "Loket tidak aktif." },
  COUNTER_IN_USE: { status: 409, message: "Loket sedang dipakai petugas lain." },
  COUNTER_ALREADY_HELD: { status: 409, message: "Anda sudah membuka loket lain." },
  COUNTER_BUSY: { status: 409, message: "Selesaikan nomor yang sedang dilayani." },
  COUNTER_NOT_HELD: { status: 403, message: "Loket ini bukan loket Anda." },
  COUNTER_NOT_OPEN: { status: 409, message: "Loket belum dibuka." },
  NO_ACTIVE_TICKET: { status: 409, message: "Tidak ada nomor yang sedang dilayani." },
  RECALL_LIMIT: { status: 409, message: "Batas panggil ulang sudah tercapai." },
};

export async function handleCounterAction(
  db: PrismaClient,
  userId: number,
  counterIdRaw: string,
  actionRaw: string,
): Promise<Response> {
  const counterId = z.string().regex(/^\d+$/).safeParse(counterIdRaw);
  const action = z.enum(actions).safeParse(actionRaw);
  if (!counterId.success || !action.success) {
    return Response.json(
      { error: { code: "VALIDATION", message: "Permintaan loket tidak valid." } },
      { status: 400 },
    );
  }

  const id = Number(counterId.data);
  try {
    await ensureDayClosed(db);
    if (action.data === "open") {
      return Response.json({ counter: await openCounter(db, { counterId: id, userId }) });
    }
    if (action.data === "pause") {
      return Response.json({ counter: await pauseCounter(db, { counterId: id, userId }) });
    }
    if (action.data === "close") {
      return Response.json({ counter: await closeCounter(db, { counterId: id, userId }) });
    }
    if (action.data === "next" || action.data === "no-show") {
      const result =
        action.data === "next"
          ? await callNext(db, { counterId: id, userId })
          : await markNoShow(db, { counterId: id, userId });
      return Response.json({
        finished: ticketJson(result.finished),
        called: ticketJson(result.called),
      });
    }
    if (action.data === "recall") {
      return Response.json({ ticket: ticketJson(await recallTicket(db, { counterId: id, userId })) });
    }
    return Response.json({ ticket: ticketJson(await finishTicket(db, { counterId: id, userId })) });
  } catch (error) {
    if (error instanceof QueueError) {
      const known = clientErrors[error.code];
      if (known) {
        return Response.json(
          { error: { code: error.code, message: known.message } },
          { status: known.status },
        );
      }
    }
    console.error(error);
    return Response.json(
      { error: { code: "COUNTER_FAILED", message: "Loket gagal diproses." } },
      { status: 500 },
    );
  }
}

function ticketJson(ticket: QueueTicket | null): {
  id: string;
  number: string;
  status: string;
  serviceId: number;
  callCount: number;
  calledAt: string | null;
} | null {
  if (!ticket) return null;
  return {
    id: ticket.id.toString(),
    number: ticket.number,
    status: ticket.status,
    serviceId: ticket.serviceId,
    callCount: ticket.callCount,
    calledAt: ticket.calledAt ? ticket.calledAt.toISOString() : null,
  };
}
