import "dotenv/config";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { authenticate } from "@/lib/auth/credentials";
import { callNext, issueTicket, QueueError } from "@/lib/queue";
import { closeCounter, openCounter, pauseCounter } from "@/lib/queue/desk";
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

describe("counter desk", () => {
  it("gives two officers different numbers when they call in turn", async () => {
    const serviceId = await insertService();
    const officerA = await insertUser("staff.a");
    const officerB = await insertUser("staff.b");
    const counterA = await insertCounter("CS 1", serviceId);
    const counterB = await insertCounter("CS 2", serviceId);

    await openCounter(prisma, { counterId: counterA, userId: officerA });
    await openCounter(prisma, { counterId: counterB, userId: officerB });
    for (let index = 0; index < 4; index += 1) {
      await issueTicket(prisma, { serviceId, requestId: randomUUID() });
    }

    const called = [];
    for (const counter of [
      { counterId: counterA, userId: officerA },
      { counterId: counterB, userId: officerB },
      { counterId: counterA, userId: officerA },
      { counterId: counterB, userId: officerB },
    ]) {
      const result = await callNext(prisma, counter);
      called.push(result.called?.id.toString());
    }

    expect(called.every((id) => id)).toBe(true);
    expect(new Set(called).size).toBe(4);
  });

  it("rejects pause, close, and a second officer while a ticket is being served", async () => {
    const serviceId = await insertService();
    const officerA = await insertUser("staff.a");
    const officerB = await insertUser("staff.b");
    const counterA = await insertCounter("CS 1", serviceId);
    const counterB = await insertCounter("CS 2", serviceId);
    await openCounter(prisma, { counterId: counterA, userId: officerA });
    await issueTicket(prisma, { serviceId, requestId: randomUUID() });
    await callNext(prisma, { counterId: counterA, userId: officerA });

    await expect(pauseCounter(prisma, { counterId: counterA, userId: officerA })).rejects.toMatchObject({
      code: "COUNTER_BUSY",
    });
    await expect(closeCounter(prisma, { counterId: counterA, userId: officerA })).rejects.toMatchObject({
      code: "COUNTER_BUSY",
    });
    await expect(openCounter(prisma, { counterId: counterA, userId: officerB })).rejects.toMatchObject({
      code: "COUNTER_IN_USE",
    });
    await expect(callNext(prisma, { counterId: counterA, userId: officerB })).rejects.toBeInstanceOf(QueueError);

    await expect(openCounter(prisma, { counterId: counterB, userId: officerA })).rejects.toMatchObject({
      code: "COUNTER_ALREADY_HELD",
    });
  });

  it("accepts the seeded password and rejects a wrong or inactive one", async () => {
    const hash = await argon2.hash("change-me");
    await prisma.$executeRaw`
      INSERT INTO users (username, name, password_hash, role)
      VALUES ('petugas.cs', 'Petugas CS', ${hash}, 'STAFF')
    `;
    await expect(authenticate("petugas.cs", "change-me", prisma)).resolves.toMatchObject({
      name: "Petugas CS",
      role: "STAFF",
    });
    await expect(authenticate("petugas.cs", "salah", prisma)).resolves.toBeNull();
    // "change-me" adalah sandi bawaan: masuk diterima, tapi akun wajib mengganti sandinya.
    const flagged = await prisma.$queryRaw<{ must_change_password: boolean }[]>`
      SELECT must_change_password FROM users WHERE username = 'petugas.cs'
    `;
    expect(flagged[0]?.must_change_password).toBe(true);

    await prisma.$executeRaw`UPDATE users SET is_active = false WHERE username = 'petugas.cs'`;
    await expect(authenticate("petugas.cs", "change-me", prisma)).resolves.toBeNull();
  });
});

async function insertService(): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO services (name, prefix, sort_order)
    VALUES ('Customer Service', 'A', 1)
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error("Service insert failed");
  return id;
}

async function insertUser(username: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO users (username, name, password_hash, role)
    VALUES (${username}, ${username}, 'test-hash', 'STAFF')
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error("User insert failed");
  return id;
}

async function insertCounter(name: string, serviceId: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO counters (name, display_number)
    VALUES (${name}, 1)
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error("Counter insert failed");
  await prisma.$executeRaw`
    INSERT INTO counter_services (counter_id, service_id)
    VALUES (${id}, ${serviceId})
  `;
  return id;
}
