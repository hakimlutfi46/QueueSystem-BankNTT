import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  callNext,
  closeDay,
  finishTicket,
  issueTicket,
  markNoShow,
  QueueError,
  recallTicket,
} from "@/lib/queue";
import { createTestPrisma, ensureTestDatabase } from "./database";

let prisma: PrismaClient;
let pool: { end: () => Promise<void> };

type Fixture = {
  serviceA: number;
  serviceB: number;
  staffA: number;
  staffB: number;
  counters: number[];
  sharedCounter: number;
};

let fixture: Fixture;

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

  const services = await prisma.$queryRaw<{ id: number; prefix: string }[]>`
    INSERT INTO services (name, prefix, sort_order)
    VALUES ('Customer Service', 'A', 1), ('Teller', 'B', 2)
    RETURNING id, prefix
  `;
  const users = await prisma.$queryRaw<{ id: number; username: string }[]>`
    INSERT INTO users (username, name, password_hash, role)
    VALUES
      ('staff.a', 'Petugas A', 'test-hash', 'STAFF'),
      ('staff.b', 'Petugas B', 'test-hash', 'STAFF')
    RETURNING id, username
  `;
  const staffA = users.find((user) => user.username === "staff.a")?.id;
  const staffB = users.find((user) => user.username === "staff.b")?.id;
  const serviceA = services.find((service) => service.prefix === "A")?.id;
  const serviceB = services.find((service) => service.prefix === "B")?.id;
  if (!staffA || !staffB || !serviceA || !serviceB) {
    throw new Error("Fixture insert failed");
  }

  const counters = await prisma.$queryRaw<{ id: number; name: string }[]>`
    INSERT INTO counters (name, display_number, status, current_user_id)
    VALUES
      ('CS 1', 1, 'OPEN', ${staffA}),
      ('CS 2', 2, 'OPEN', ${staffA}),
      ('CS 3', 3, 'OPEN', ${staffA}),
      ('CS 4', 4, 'OPEN', ${staffA}),
      ('CS 5', 5, 'OPEN', ${staffA}),
      ('CS+Teller', 6, 'OPEN', ${staffA}),
      ('CS B', 7, 'OPEN', ${staffB})
    RETURNING id, name
  `;
  const idOf = (name: string) => {
    const id = counters.find((counter) => counter.name === name)?.id;
    if (!id) throw new Error(`Missing counter ${name}`);
    return id;
  };
  const owned = ["CS 1", "CS 2", "CS 3", "CS 4", "CS 5"].map(idOf);
  for (const counterId of [...owned, idOf("CS B")]) {
    await prisma.$executeRaw`
      INSERT INTO counter_services (counter_id, service_id)
      VALUES (${counterId}, ${serviceA})
    `;
  }
  const sharedCounter = idOf("CS+Teller");
  await prisma.$executeRaw`
    INSERT INTO counter_services (counter_id, service_id)
    VALUES (${sharedCounter}, ${serviceA}), (${sharedCounter}, ${serviceB})
  `;
  await prisma.$executeRaw`
    INSERT INTO settings (key, value) VALUES ('max_recall', '3'::jsonb)
  `;

  fixture = { serviceA, serviceB, staffA, staffB, counters: owned, sharedCounter };
});

async function orderViolated(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ violated: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM tickets AS waiting
      JOIN tickets AS called
        ON called.service_id = waiting.service_id
       AND called.service_date = waiting.service_date
       AND called.status IN ('SERVING', 'DONE', 'NO_SHOW')
       AND waiting.status = 'WAITING'
       AND waiting.seq < called.seq
    ) AS violated
  `;
  return rows[0]?.violated ?? false;
}

describe("queue engine", { concurrent: false }, () => {
  it("penomoran serentak: 100 concurrent tickets get seq 1 through 100", async () => {
    const issued = await Promise.all(
      Array.from({ length: 100 }, () =>
        issueTicket(prisma, { serviceId: fixture.serviceA, requestId: randomUUID() }),
      ),
    );
    const sequences = issued.map((item) => item.ticket.seq).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(new Set(issued.map((item) => item.ticket.number)).size).toBe(100);
    expect(issued.find((item) => item.ticket.seq === 1)?.ticket.number).toBe("A001");
    expect(issued.find((item) => item.ticket.seq === 100)?.ticket.number).toBe("A100");
  }, 30_000);

  it("panggilan serentak: five counters call 50 tickets exactly once", async () => {
    await Promise.all(
      Array.from({ length: 50 }, () =>
        issueTicket(prisma, { serviceId: fixture.serviceA, requestId: randomUUID() }),
      ),
    );

    await Promise.all(
      fixture.counters.map(async (counterId) => {
        for (;;) {
          const result = await callNext(prisma, { counterId, userId: fixture.staffA });
          if (result.called) continue;
          const waiting = await prisma.$queryRaw<{ waiting: number }[]>`
            SELECT count(*)::int AS waiting FROM tickets WHERE status = 'WAITING'
          `;
          if ((waiting[0]?.waiting ?? 0) === 0) break;
        }
      }),
    );

    const tickets = await prisma.$queryRaw<{ status: string; seq: number; called_at: Date }[]>`
      SELECT status::text AS status, seq, called_at
      FROM tickets
      ORDER BY seq
    `;
    expect(tickets).toHaveLength(50);
    expect(tickets.every((ticket) => ticket.status === "DONE" && ticket.called_at instanceof Date)).toBe(
      true,
    );

    const events = await prisma.$queryRaw<{ calls: number }[]>`
      SELECT count(*)::int AS calls
      FROM ticket_events
      WHERE type = 'CALLED'
      GROUP BY ticket_id
    `;
    expect(events).toHaveLength(50);
    expect(events.every((event) => event.calls === 1)).toBe(true);
    expect(await orderViolated()).toBe(false);
  }, 30_000);

  it("urutan: a waiting ticket never has a smaller number than one already called", async () => {
    for (let index = 0; index < 5; index += 1) {
      await issueTicket(prisma, { serviceId: fixture.serviceA, requestId: randomUUID() });
    }
    for (let index = 0; index < 5; index += 1) {
      const result = await callNext(prisma, { counterId: fixture.counters[0], userId: fixture.staffA });
      expect(result.called?.seq).toBe(index + 1);
      expect(await orderViolated()).toBe(false);
    }
  });

  it("urutan: a counter serving two services takes the earliest ticket", async () => {
    const first = await issueTicket(prisma, { serviceId: fixture.serviceB, requestId: randomUUID() });
    await issueTicket(prisma, { serviceId: fixture.serviceA, requestId: randomUUID() });
    const result = await callNext(prisma, {
      counterId: fixture.sharedCounter,
      userId: fixture.staffA,
    });
    expect(result.called?.id).toBe(first.ticket.id);
    expect(result.called?.number).toBe("B001");
  });

  it("satu tiket aktif: a second serving ticket on the same counter is rejected", async () => {
    await issueTicket(prisma, { serviceId: fixture.serviceA, requestId: randomUUID() });
    const second = await issueTicket(prisma, { serviceId: fixture.serviceA, requestId: randomUUID() });
    await callNext(prisma, { counterId: fixture.counters[0], userId: fixture.staffA });

    await expect(
      prisma.$executeRaw`
        UPDATE tickets
        SET status = 'SERVING', counter_id = ${fixture.counters[0]}
        WHERE id = ${second.ticket.id.toString()}::bigint
      `,
    ).rejects.toThrow(/tickets_one_active_per_counter/);

    const rows = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM tickets WHERE id = ${second.ticket.id.toString()}::bigint
    `;
    expect(rows[0]?.status).toBe("WAITING");
  });

  it("reset harian: the first ticket of a new date is 001 in APP_TIMEZONE", async () => {
    const instant = new Date("2026-10-07T16:30:00.000Z");
    const makassar = await issueTicket(prisma, {
      serviceId: fixture.serviceA,
      requestId: randomUUID(),
      now: instant,
      timeZone: "Asia/Makassar",
    });
    const jakarta = await issueTicket(prisma, {
      serviceId: fixture.serviceA,
      requestId: randomUUID(),
      now: instant,
      timeZone: "Asia/Jakarta",
    });

    expect(makassar.ticket.serviceDate).toBe("2026-10-08");
    expect(makassar.ticket.number).toBe("A001");
    expect(jakarta.ticket.serviceDate).toBe("2026-10-07");
    expect(jakarta.ticket.number).toBe("A001");

    const laterThatMorning = await issueTicket(prisma, {
      serviceId: fixture.serviceA,
      requestId: randomUUID(),
      now: new Date("2026-10-07T17:00:00.000Z"),
      timeZone: "Asia/Makassar",
    });
    expect(laterThatMorning.ticket.serviceDate).toBe("2026-10-08");
    expect(laterThatMorning.ticket.number).toBe("A002");
  });

  it("idempotensi: the same requestId returns the same ticket", async () => {
    const requestId = randomUUID();
    const first = await issueTicket(prisma, { serviceId: fixture.serviceA, requestId });
    const repeat = await issueTicket(prisma, { serviceId: fixture.serviceA, requestId });
    expect(repeat.ticket.id).toBe(first.ticket.id);
    expect(repeat.ticket.number).toBe(first.ticket.number);

    const raced = randomUUID();
    const burst = await Promise.all(
      Array.from({ length: 8 }, () =>
        issueTicket(prisma, { serviceId: fixture.serviceA, requestId: raced }),
      ),
    );
    expect(new Set(burst.map((item) => item.ticket.id.toString())).size).toBe(1);
    expect(burst[0]?.ticket.seq).toBe(2);

    const next = await issueTicket(prisma, {
      serviceId: fixture.serviceA,
      requestId: randomUUID(),
    });
    expect(next.ticket.seq).toBe(3);
  });

  it("transisi status: illegal moves are rejected and the ticket stays put", async () => {
    const issued = await issueTicket(prisma, {
      serviceId: fixture.serviceA,
      requestId: randomUUID(),
    });
    const action = { counterId: fixture.counters[0], userId: fixture.staffA };
    await expect(finishTicket(prisma, action)).rejects.toMatchObject({ code: "NO_ACTIVE_TICKET" });
    await expect(markNoShow(prisma, action)).rejects.toMatchObject({ code: "NO_ACTIVE_TICKET" });
    await expect(recallTicket(prisma, action)).rejects.toMatchObject({ code: "NO_ACTIVE_TICKET" });

    const waiting = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM tickets WHERE id = ${issued.ticket.id.toString()}::bigint
    `;
    expect(waiting[0]?.status).toBe("WAITING");

    await callNext(prisma, action);
    await finishTicket(prisma, action);
    await expect(recallTicket(prisma, action)).rejects.toBeInstanceOf(QueueError);
    const done = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM tickets WHERE id = ${issued.ticket.id.toString()}::bigint
    `;
    expect(done[0]?.status).toBe("DONE");

    const yesterday = new Date("2026-10-07T02:00:00.000Z");
    const today = new Date("2026-10-08T02:00:00.000Z");
    const oldWaiting = await issueTicket(prisma, {
      serviceId: fixture.serviceA,
      requestId: randomUUID(),
      now: yesterday,
      timeZone: "Asia/Makassar",
    });
    const current = await issueTicket(prisma, {
      serviceId: fixture.serviceA,
      requestId: randomUUID(),
      now: today,
      timeZone: "Asia/Makassar",
    });
    await closeDay(prisma, { now: today, timeZone: "Asia/Makassar" });
    const statuses = await prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT id::text AS id, status::text AS status FROM tickets
    `;
    expect(statuses.find((row) => row.id === oldWaiting.ticket.id.toString())?.status).toBe("EXPIRED");
    expect(statuses.find((row) => row.id === current.ticket.id.toString())?.status).toBe("WAITING");
    const called = await callNext(prisma, { ...action, now: today, timeZone: "Asia/Makassar" });
    expect(called.called?.id).toBe(current.ticket.id);
  });

  it("hak akses: an officer cannot call from a counter held by someone else", async () => {
    await issueTicket(prisma, { serviceId: fixture.serviceA, requestId: randomUUID() });
    await expect(
      callNext(prisma, { counterId: fixture.counters[0], userId: fixture.staffB }),
    ).rejects.toMatchObject({ code: "COUNTER_NOT_HELD" });
    const rows = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM tickets
    `;
    expect(rows.every((row) => row.status === "WAITING")).toBe(true);
  });

  it("tutup hari: serving tickets from the previous date are auto-closed", async () => {
    const yesterday = new Date("2026-10-07T02:00:00.000Z");
    const today = new Date("2026-10-08T02:00:00.000Z");
    await issueTicket(prisma, {
      serviceId: fixture.serviceA,
      requestId: randomUUID(),
      now: yesterday,
      timeZone: "Asia/Makassar",
    });
    await callNext(prisma, {
      counterId: fixture.counters[0],
      userId: fixture.staffA,
      now: yesterday,
      timeZone: "Asia/Makassar",
    });
    const result = await closeDay(prisma, { now: today, timeZone: "Asia/Makassar" });
    expect(result.autoClosed).toBe(1);
    const rows = await prisma.$queryRaw<{ status: string; auto_closed: boolean }[]>`
      SELECT status::text AS status, auto_closed FROM tickets
    `;
    expect(rows[0]).toEqual({ status: "DONE", auto_closed: true });
  });

  it("panggil ulang stops at max_recall and does not return the ticket to the queue", async () => {
    await issueTicket(prisma, { serviceId: fixture.serviceA, requestId: randomUUID() });
    const action = { counterId: fixture.counters[0], userId: fixture.staffA };
    await callNext(prisma, action);
    const recalled = [];
    for (let index = 0; index < 3; index += 1) {
      recalled.push(await recallTicket(prisma, action));
    }
    expect(recalled.map((ticket) => ticket.callCount)).toEqual([2, 3, 4]);
    await expect(recallTicket(prisma, action)).rejects.toMatchObject({ code: "RECALL_LIMIT" });
    const result = await markNoShow(prisma, action);
    expect(result.finished?.status).toBe("NO_SHOW");
    expect(result.called).toBeNull();
  });
});
