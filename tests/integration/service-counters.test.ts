import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createCounter, listCounters, updateCounter } from "@/lib/admin/counters";
import { createService, listServiceCounters, setServiceCounters } from "@/lib/admin/services";
import { createUser } from "@/lib/admin/users";
import { callNext, issueTicket } from "@/lib/queue";
import { openCounter } from "@/lib/queue/desk";
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

async function servicesOf(counterId: number): Promise<number[]> {
  const counter = (await listCounters(prisma)).find((item) => item.id === counterId);
  return counter?.serviceIds ?? [];
}

describe("service counters", () => {
  it("lets only the linked counters call the service's tickets", async () => {
    const teller = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
    const complaint = await createService(prisma, { name: "Pengaduan Layanan", prefix: "P", sortOrder: 2 });
    const cs1 = await createCounter(prisma, { name: "CS 1", displayNumber: 1, serviceIds: [teller.id] });
    const cs2 = await createCounter(prisma, { name: "CS 2", displayNumber: 2, serviceIds: [teller.id] });
    const teller1 = await createCounter(prisma, { name: "Teller 1", displayNumber: 3, serviceIds: [teller.id] });

    await expect(setServiceCounters(prisma, complaint.id, { counterIds: [cs2.id, cs1.id, cs1.id] })).resolves.toEqual({
      serviceId: complaint.id,
      counterIds: [cs1.id, cs2.id],
    });
    expect((await listServiceCounters(prisma)).get(complaint.id)).toEqual([cs1.id, cs2.id]);
    expect(await servicesOf(cs1.id)).toEqual([teller.id, complaint.id]);

    const sari = await createUser(prisma, { username: "sari", name: "Sari", password: "rahasia", role: "STAFF" });
    const budi = await createUser(prisma, { username: "budi", name: "Budi", password: "rahasia", role: "STAFF" });
    await openCounter(prisma, { counterId: teller1.id, userId: budi.id });
    await openCounter(prisma, { counterId: cs1.id, userId: sari.id });
    const issued = await issueTicket(prisma, { serviceId: complaint.id, requestId: randomUUID() });

    const unlinked = await callNext(prisma, { counterId: teller1.id, userId: budi.id });
    expect(unlinked.called).toBeNull();
    const linked = await callNext(prisma, { counterId: cs1.id, userId: sari.id });
    expect(linked.called?.id).toBe(issued.ticket.id);

    // Melepas CS 2 dari layanan pengaduan.
    await expect(setServiceCounters(prisma, complaint.id, { counterIds: [cs1.id] })).resolves.toMatchObject({
      counterIds: [cs1.id],
    });
    expect(await servicesOf(cs2.id)).toEqual([teller.id]);
  });

  it("refuses to leave a counter without any service", async () => {
    const teller = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
    const cs3 = await createCounter(prisma, { name: "CS 3", displayNumber: 3, serviceIds: [teller.id] });

    await expect(setServiceCounters(prisma, teller.id, { counterIds: [] })).rejects.toMatchObject({
      code: "COUNTER_LAST_SERVICE",
      message: "CS 3 tidak punya layanan lain. Tambahkan layanan lain ke CS 3 dulu di menu Loket.",
    });
    expect(await servicesOf(cs3.id)).toEqual([teller.id]);
  });

  it("rejects unknown services and unknown or inactive counters", async () => {
    const teller = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
    const other = await createService(prisma, { name: "Kredit", prefix: "K", sortOrder: 2 });
    const closed = await createCounter(prisma, { name: "CS 9", displayNumber: 9, serviceIds: [teller.id] });
    await updateCounter(prisma, closed.id, { isActive: false });

    await expect(setServiceCounters(prisma, 999, { counterIds: [] })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Layanan tidak ditemukan.",
    });
    await expect(setServiceCounters(prisma, other.id, { counterIds: [999] })).rejects.toMatchObject({
      code: "VALIDATION",
      message: expect.stringContaining("tidak ditemukan"),
    });
    await expect(setServiceCounters(prisma, other.id, { counterIds: [closed.id] })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "CS 9 sedang nonaktif. Aktifkan dulu di menu Loket.",
    });
    await expect(setServiceCounters(prisma, other.id, { counterIds: ["x"] })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(setServiceCounters(prisma, other.id, null)).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await listServiceCounters(prisma)).get(other.id)).toBeUndefined();
  });

  it("never leaves a counter without services when two admins save at once", async () => {
    for (let round = 0; round < 5; round += 1) {
      await prisma.$executeRaw`TRUNCATE TABLE counter_services, counters, services RESTART IDENTITY CASCADE`;
      const first = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
      const second = await createService(prisma, { name: "Pengaduan", prefix: "P", sortOrder: 2 });
      const shared = await createCounter(prisma, {
        name: "CS 1",
        displayNumber: 1,
        serviceIds: [first.id, second.id],
      });

      const results = await Promise.allSettled([
        setServiceCounters(prisma, first.id, { counterIds: [] }),
        setServiceCounters(prisma, second.id, { counterIds: [] }),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      expect(fulfilled.length).toBeLessThanOrEqual(1);
      for (const result of results) {
        if (result.status === "rejected") {
          expect(result.reason).toMatchObject({ code: "COUNTER_LAST_SERVICE" });
        }
      }
      expect((await servicesOf(shared.id)).length).toBeGreaterThanOrEqual(1);
    }
  });
});
