import type { PrismaClient } from "@/generated/prisma/client";
import { closeDay } from "@/lib/queue/close-day";
import { serviceDate } from "@/lib/queue/sql";

const globalForDay = globalThis as typeof globalThis & {
  queueDayClosedFor?: string;
  queueDayCloseStarted?: boolean;
};

export async function ensureDayClosed(db: PrismaClient): Promise<void> {
  const today = await serviceDate(db, undefined);
  if (globalForDay.queueDayClosedFor === today) return;
  await closeDay(db);
  globalForDay.queueDayClosedFor = today;
}

export function startDayClose(run: () => Promise<void>): void {
  if (globalForDay.queueDayCloseStarted) return;
  globalForDay.queueDayCloseStarted = true;
  void run().catch((error: unknown) => {
    console.error(error);
  });
  const timer = setInterval(() => {
    void run().catch((error: unknown) => {
      console.error(error);
    });
  }, 60_000);
  timer.unref();
}

export function resetDayCloseForTests(): void {
  globalForDay.queueDayClosedFor = undefined;
}
