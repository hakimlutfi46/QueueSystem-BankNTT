import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadPrintableTicket } from "@/lib/print/load-ticket";
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

describe("timestamps from raw queries", () => {
  it("read the real instant whatever the PostgreSQL server time zone is", async () => {
    const rows = await prisma.$queryRaw<{ now: Date; zone: string }[]>`
      SELECT now() AS now, current_setting('TimeZone') AS zone`;
    expect(rows[0]?.zone).toBe("UTC");
    expect(Math.abs((rows[0]?.now.getTime() ?? 0) - Date.now())).toBeLessThan(5_000);
  });

  it("prints the ticket time in the branch time zone", async () => {
    await prisma.$executeRaw`TRUNCATE TABLE ticket_events, tickets, daily_sequences RESTART IDENTITY CASCADE`;
    const services = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO services (name, prefix, sort_order) VALUES ('Uji Waktu', 'W', 99)
      ON CONFLICT (prefix) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO tickets (request_id, service_id, service_date, seq, number, created_at)
      VALUES (${randomUUID()}::uuid, ${services[0]?.id}, '2026-10-09', 1, 'W001', '2026-10-09T08:31:00Z')
      RETURNING id::text AS id`;
    const ticket = await loadPrintableTicket(rows[0]?.id ?? "", prisma);
    // 08.31 UTC = 16.31 WITA (zona uji), bukan 23.31 seperti saat offset hilang.
    expect(ticket?.issuedAt).toContain("16.31");
  });
});
