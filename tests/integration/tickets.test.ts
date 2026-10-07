import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadPrintableTicket } from "@/lib/print/load-ticket";
import { issueTicketResponse } from "@/lib/tickets/issue-request";
import { createTestPrisma, ensureTestDatabase } from "./database";

let prisma: PrismaClient;
let pool: { end: () => Promise<void> };
let serviceId = 0;

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
  const services = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO services (name, prefix, sort_order)
    VALUES ('Customer Service', 'A', 1)
    RETURNING id
  `;
  serviceId = services[0]?.id ?? 0;
  await prisma.$executeRaw`
    INSERT INTO settings (key, value)
    VALUES
      ('branch_name', '"Cabang Kupang"'::jsonb),
      ('ticket_footer', '"Simpan tiket ini."'::jsonb),
      ('ticket_width_mm', '80'::jsonb)
  `;
});

describe("ticket issue API", { concurrent: false }, () => {
  it("rejects an invalid body before taking a number", async () => {
    const response = await issueTicketResponse(prisma, { serviceId: "A", requestId: "nope" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "VALIDATION", message: "Data tiket tidak valid." },
    });
    const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM tickets`;
    expect(rows[0]?.count).toBe(0);
  });

  it("returns the same ticket when the kiosk repeats a request", async () => {
    const requestId = randomUUID();
    const first = await issueTicketResponse(prisma, { serviceId, requestId });
    const second = await issueTicketResponse(prisma, { serviceId, requestId });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { ticket: { id: string; number: string }; aheadCount: number };
    const secondBody = (await second.json()) as { ticket: { id: string; number: string } };
    expect(firstBody.ticket.number).toBe("A001");
    expect(firstBody.aheadCount).toBe(0);
    expect(secondBody.ticket.id).toBe(firstBody.ticket.id);

    const printed = await loadPrintableTicket(firstBody.ticket.id, prisma);
    expect(printed).toMatchObject({
      number: "A001",
      serviceName: "Customer Service",
      aheadCount: 0,
      branchName: "Cabang Kupang",
      footer: "Simpan tiket ini.",
      widthMm: 80,
    });
    const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM tickets`;
    expect(rows[0]?.count).toBe(1);
  });
});
