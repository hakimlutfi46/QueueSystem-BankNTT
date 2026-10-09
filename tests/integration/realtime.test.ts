import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { callNext, issueTicket, recallTicket } from "@/lib/queue";
import { publish } from "@/lib/realtime/hub";
import { QueueListener, type ListenerStatus } from "@/lib/realtime/listen";
import { loadQueueState } from "@/lib/realtime/state";
import { createQueueEventStream } from "@/lib/realtime/stream";
import type { QueueEvent } from "@/lib/realtime/types";
import { createTestPrisma, ensureTestDatabase } from "./database";

let prisma: PrismaClient;
let pool: { end: () => Promise<void> };
let serviceId = 0;
let userId = 0;
let counterId = 0;

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
  const users = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO users (username, name, password_hash, role)
    VALUES ('staff.a', 'Petugas A', 'test-hash', 'STAFF')
    RETURNING id
  `;
  serviceId = services[0]?.id ?? 0;
  userId = users[0]?.id ?? 0;
  const counters = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO counters (name, display_number, status, current_user_id)
    VALUES ('CS 1', 1, 'OPEN', ${userId})
    RETURNING id
  `;
  counterId = counters[0]?.id ?? 0;
  await prisma.$executeRaw`
    INSERT INTO counter_services (counter_id, service_id)
    VALUES (${counterId}, ${serviceId})
  `;
  await prisma.$executeRaw`
    INSERT INTO settings (key, value)
    VALUES
      ('branch_name', '"Cabang Kupang"'::jsonb),
      ('running_text', '"Selamat datang"'::jsonb),
      ('voice_enabled', 'true'::jsonb),
      ('max_recall', '3'::jsonb)
  `;
});

describe("realtime", { concurrent: false }, () => {
  it("shows a database change on the stream in under two seconds", async () => {
    const databaseUrl = testUrl();
    const listener = startListener(databaseUrl);
    const reader = createQueueEventStream({ heartbeatMs: 60_000 }).getReader();
    try {
      await listener.start();
      const started = performance.now();
      const issued = await issueTicket(prisma, { serviceId, requestId: randomUUID() });
      const event = await nextEvent(reader, 2_000);
      expect(performance.now() - started).toBeLessThan(2_000);
      expect(event.type).toBe("TICKET_ISSUED");
      expect(event.ticketId).toBe(issued.ticket.id.toString());
    } finally {
      await reader.cancel();
      await listener.stop();
    }
  });

  it("receives the next change after the listen connection is cut", async () => {
    const databaseUrl = testUrl();
    const statuses: ListenerStatus[] = [];
    let wake: (() => void) | null = null;
    const listener = new QueueListener({
      connectionString: databaseUrl,
      reconnectDelayMs: 50,
      onEvent: publish,
      onStatus: (status) => {
        statuses.push(status);
        wake?.();
      },
    });
    const reader = createQueueEventStream({ heartbeatMs: 60_000 }).getReader();
    try {
      await listener.start();
      await nextEvent(reader, 2_000, () =>
        issueTicket(prisma, { serviceId, requestId: randomUUID() }),
      );

      const disconnected = waitForStatus(statuses, "disconnected", (next) => {
        wake = next;
      });
      await prisma.$queryRaw`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE application_name = 'queue_listen'
          AND datname = current_database()
          AND pid <> pg_backend_pid()
      `;
      await disconnected;
      await waitForStatus(statuses, "listening", (next) => {
        wake = next;
      });

      const started = performance.now();
      const issued = await issueTicket(prisma, { serviceId, requestId: randomUUID() });
      const event = await nextEvent(reader, 2_000);
      expect(performance.now() - started).toBeLessThan(2_000);
      expect(event).toMatchObject({
        type: "TICKET_ISSUED",
        ticketId: issued.ticket.id.toString(),
      });
    } finally {
      await reader.cancel();
      await listener.stop();
    }
  });

  it("returns services, the active ticket, the last call, and display settings", async () => {
    await issueTicket(prisma, { serviceId, requestId: randomUUID() });
    const second = await issueTicket(prisma, { serviceId, requestId: randomUUID() });
    await callNext(prisma, { counterId, userId });

    const state = await loadQueueState(prisma);
    expect(state.services).toEqual([
      expect.objectContaining({ name: "Customer Service", prefix: "A", waitingCount: 1, nextNumber: "A002" }),
    ]);
    expect(state.counters).toEqual([
      expect.objectContaining({
        name: "CS 1",
        displayNumber: 1,
        status: "OPEN",
        officerName: "Petugas A",
        serviceIds: [serviceId],
        activeTicket: expect.objectContaining({ number: "A001", callCount: 1 }),
      }),
    ]);
    expect(state.lastCall).toEqual(
      expect.objectContaining({
        type: "TICKET_CALLED",
        ticketNumber: "A001",
        counterName: "CS 1",
        displayNumber: 1,
      }),
    );
    expect(state.recentCalls.map((call) => call.ticketNumber)).toEqual(["A001"]);

    // Panggil ulang tidak menambah baris; nomor berikutnya menggeser yang lama ke "panggilan sebelumnya".
    await recallTicket(prisma, { counterId, userId });
    await callNext(prisma, { counterId, userId });
    const later = await loadQueueState(prisma);
    expect(later.recentCalls.map((call) => call.ticketNumber)).toEqual(["A002", "A001"]);
    expect(later.services[0]?.nextNumber).toBeNull();

    expect(state.settings).toMatchObject({
      branchName: "Cabang Kupang",
      runningText: "Selamat datang",
      voiceEnabled: true,
      maxRecall: 3,
    });
    expect(second.ticket.number).toBe("A002");
    expect(state.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

function testUrl(): string {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set");
  const url = new URL(base);
  if (!process.env.TEST_DATABASE_URL) url.pathname = "/queue_test";
  return url.toString();
}

function startListener(connectionString: string): QueueListener {
  return new QueueListener({
    connectionString,
    onEvent: publish,
    reconnectDelayMs: 50,
  });
}

async function nextEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
  prime?: () => Promise<unknown>,
): Promise<QueueEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  if (prime) await prime();
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for a queue event")), remaining);
      }),
    ]);
    if (chunk.done) throw new Error("Queue stream closed");
    buffer += decoder.decode(chunk.value, { stream: true });
    const match = buffer.match(/data: (.*)\n/);
    if (!match?.[1]) continue;
    return JSON.parse(match[1]) as QueueEvent;
  }
  throw new Error("Timed out waiting for a queue event");
}

function waitForStatus(
  statuses: ListenerStatus[],
  expected: ListenerStatus,
  bind: (wake: () => void) => void,
): Promise<void> {
  const existing = statuses.indexOf(expected);
  if (existing >= 0) {
    statuses.splice(0, existing + 1);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${expected}`));
    }, 2_000);
    bind(() => {
      const index = statuses.indexOf(expected);
      if (index < 0) return;
      clearTimeout(timer);
      statuses.splice(0, index + 1);
      resolve();
    });
  });
}
