import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { appTimezone } from "@/lib/env";
import { ensureDayClosed, resetDayCloseForTests } from "@/lib/queue/day-close";
import { createTestPrisma, ensureTestDatabase } from "./database";

let prisma: PrismaClient;
let pool: { end: () => Promise<void> };

beforeAll(async () => {
  const databaseUrl = await ensureTestDatabase();
  const created = createTestPrisma(databaseUrl);
  prisma = created.prisma;
  pool = created.pool;
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

beforeEach(async () => {
  resetDayCloseForTests();
  await prisma.$executeRaw`
    TRUNCATE TABLE
      ticket_events,
      tickets,
      daily_sequences,
      counter_services,
      counters,
      users,
      services,
      settings
    RESTART IDENTITY CASCADE
  `;
});

describe("automatic day close", () => {
  it("expires yesterday's waiting ticket once", async () => {
    const services = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO services (name, prefix, sort_order)
      VALUES ('Customer Service', 'A', 1)
      RETURNING id
    `;
    const serviceId = Number(services[0]?.id);
    await prisma.$executeRaw`
      INSERT INTO tickets (request_id, service_id, service_date, seq, number, status, created_at)
      VALUES (
        ${randomUUID()}::uuid,
        ${serviceId},
        ((now() AT TIME ZONE ${appTimezone()})::date - 1),
        1,
        'A001',
        'WAITING',
        now() - interval '1 day'
      )
    `;

    await ensureDayClosed(prisma);
    await ensureDayClosed(prisma);

    const tickets = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM tickets
    `;
    const events = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM ticket_events WHERE type = 'EXPIRED'
    `;
    expect(tickets[0]?.status).toBe("EXPIRED");
    expect(events[0]?.count).toBe(1);
  });
});
