import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError } from "@/lib/admin/errors";
import { createCounter, createCounters, deleteCounter, updateCounter } from "@/lib/admin/counters";
import { createService, deleteService } from "@/lib/admin/services";
import { createUser, deleteUser } from "@/lib/admin/users";
import { readSettings, refreshTimezone, saveSettings } from "@/lib/admin/settings";
import { appTimezone, setTimezoneOverride } from "@/lib/env";
import { serviceDate } from "@/lib/queue/sql";
import { loadDaySummary } from "@/lib/admin/summary";
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

describe("admin records", () => {
  it("creates a counter for a service and rejects a duplicate prefix", async () => {
    const service = await createService(prisma, { name: "Prioritas", prefix: "p", sortOrder: 3 });
    expect(service.prefix).toBe("P");
    await expect(createService(prisma, { name: "Lain", prefix: "P", sortOrder: 4 })).rejects.toBeInstanceOf(AdminError);

    const counter = await createCounter(prisma, {
      name: "CS Khusus",
      displayNumber: 9,
      serviceIds: [service.id],
    });
    expect(counter).toMatchObject({ name: "CS Khusus", displayNumber: 9, isActive: true, serviceIds: [service.id] });
  });

  it("adds several counters in one step and keeps active names unique", async () => {
    const teller = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 2 });
    const created = await createCounters(prisma, {
      items: [3, 4, 5].map((number) => ({ name: `Teller ${number}`, displayNumber: number, serviceIds: [teller.id] })),
    });
    expect(created.map((counter) => counter.name)).toEqual(["Teller 3", "Teller 4", "Teller 5"]);
    expect(created.every((counter) => counter.serviceIds.join() === String(teller.id))).toBe(true);

    await expect(
      createCounter(prisma, { name: "teller 4", displayNumber: 4, serviceIds: [teller.id] }),
    ).rejects.toMatchObject({ code: "NAME_TAKEN" });

    const failed = createCounters(prisma, {
      items: [
        { name: "Teller 6", displayNumber: 6, serviceIds: [teller.id] },
        { name: "Teller 5", displayNumber: 5, serviceIds: [teller.id] },
      ],
    });
    await expect(failed).rejects.toMatchObject({ code: "NAME_TAKEN" });
    const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM counters`;
    expect(rows[0]?.count).toBe(3);

    const fourth = created[1];
    if (!fourth) throw new Error("missing counter");
    await updateCounter(prisma, fourth.id, { isActive: false });
    const again = await createCounter(prisma, { name: "Teller 4", displayNumber: 4, serviceIds: [teller.id] });
    expect(again.isActive).toBe(true);
    await expect(updateCounter(prisma, fourth.id, { isActive: true })).rejects.toMatchObject({ code: "NAME_TAKEN" });
  });

  it("summarizes today's tickets from their timestamps", async () => {
    const service = await createService(prisma, { name: "Customer Service", prefix: "A", sortOrder: 1 });
    await prisma.$executeRaw`
      INSERT INTO tickets (
        request_id, service_id, service_date, seq, number, status,
        created_at, called_at, finished_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${service.id},
        (now() AT TIME ZONE 'Asia/Makassar')::date,
        1,
        'A001',
        'DONE',
        now() - interval '90 seconds',
        now() - interval '30 seconds',
        now()
      )
    `;
    const summary = await loadDaySummary(prisma);
    expect(summary).toMatchObject({ total: 1, done: 1, waiting: 0, noShow: 0 });
    expect(summary.averageWaitSeconds).toBeGreaterThan(50);
    expect(summary.averageWaitSeconds).toBeLessThan(70);
    expect(summary.averageHandleSeconds).toBeGreaterThan(20);
    expect(summary.averageHandleSeconds).toBeLessThan(40);
  });

  it("saves branch settings", async () => {
    const saved = await saveSettings(prisma, {
      branchName: "Cabang Kupang",
      runningText: "Selamat datang",
      voiceEnabled: false,
      maxRecall: 2,
      targetServiceMinutes: 8,
      ticketFooter: "Terima kasih",
      ticketWidthMm: 58,
    });
    expect(saved.branchName).toBe("Cabang Kupang");
    await expect(readSettings(prisma)).resolves.toMatchObject({ voiceEnabled: false, ticketWidthMm: 58 });
  });

  it("switches the branch time zone from Admin and uses it for the queue date", async () => {
    const base = {
      branchName: "Cabang Jakarta",
      runningText: "",
      voiceEnabled: true,
      maxRecall: 3,
      targetServiceMinutes: 10,
      ticketFooter: "",
      ticketWidthMm: 80,
    };
    try {
      await expect(saveSettings(prisma, { ...base, timeZone: "Asia/Jakarta" })).resolves.toMatchObject({
        timeZone: "Asia/Jakarta",
      });
      expect(appTimezone()).toBe("Asia/Jakarta");
      // 23.30 WIB masih tanggal 8, padahal di WITA sudah tanggal 9.
      await expect(serviceDate(prisma, new Date("2026-10-08T16:30:00Z"))).resolves.toBe("2026-10-08");

      setTimezoneOverride(null);
      await expect(refreshTimezone(prisma)).resolves.toBe("Asia/Jakarta");
      expect(appTimezone()).toBe("Asia/Jakarta");

      await expect(saveSettings(prisma, { ...base, timeZone: "UTC" })).rejects.toMatchObject({
        message: "Zona waktu harus WIB, WITA, atau WIT.",
      });
    } finally {
      setTimezoneOverride(null);
    }
  });

  it("deletes a counter and disassociates related tickets and events", async () => {
    const service = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
    const counter = await createCounter(prisma, { name: "Teller 1", displayNumber: 1, serviceIds: [service.id] });

    // Ticket with counter assigned
    await prisma.$executeRaw`
      INSERT INTO tickets (request_id, service_id, counter_id, service_date, seq, number, status)
      VALUES (${randomUUID()}::uuid, ${service.id}, ${counter.id}, (now() AT TIME ZONE 'Asia/Makassar')::date, 1, 'B001', 'DONE')
    `;

    await deleteCounter(prisma, counter.id);

    const checkCounter = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM counters WHERE id = ${counter.id}
    `;
    expect(checkCounter[0]?.count).toBe(0);

    const checkTicket = await prisma.$queryRaw<{ counter_id: number | null }[]>`
      SELECT counter_id FROM tickets WHERE number = 'B001'
    `;
    expect(checkTicket[0]?.counter_id).toBeNull();
  });

  it("rejects deleting a service with active tickets, but allows deleting when tickets are completed", async () => {
    const service = await createService(prisma, { name: "Customer Service", prefix: "A", sortOrder: 1 });

    // Insert active ticket
    await prisma.$executeRaw`
      INSERT INTO tickets (request_id, service_id, service_date, seq, number, status)
      VALUES (${randomUUID()}::uuid, ${service.id}, (now() AT TIME ZONE 'Asia/Makassar')::date, 1, 'A001', 'WAITING')
    `;

    await expect(deleteService(prisma, service.id)).rejects.toMatchObject({
      code: "SERVICE_BUSY",
    });

    // Mark as DONE
    await prisma.$executeRaw`UPDATE tickets SET status = 'DONE' WHERE number = 'A001'`;

    await deleteService(prisma, service.id);

    const checkService = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM services WHERE id = ${service.id}
    `;
    expect(checkService[0]?.count).toBe(0);
  });

  it("prevents self-deletion and checks duty status before deleting a user", async () => {
    const admin = await createUser(prisma, {
      username: "admin1",
      name: "Admin One",
      role: "ADMIN",
      password: "password123",
      isActive: true,
    });

    const staff = await createUser(prisma, {
      username: "staff1",
      name: "Staff One",
      role: "STAFF",
      password: "password123",
      isActive: true,
    });

    // Self deletion blocked
    await expect(deleteUser(prisma, admin.id, admin.id)).rejects.toMatchObject({
      code: "CANNOT_DELETE_SELF",
    });

    // Create a counter held by staff
    const service = await createService(prisma, { name: "CS", prefix: "C", sortOrder: 1 });
    const counter = await createCounter(prisma, { name: "CS 1", displayNumber: 1, serviceIds: [service.id] });
    await prisma.$executeRaw`UPDATE counters SET current_user_id = ${staff.id}, status = 'OPEN' WHERE id = ${counter.id}`;

    await expect(deleteUser(prisma, staff.id, admin.id)).rejects.toMatchObject({
      code: "USER_ON_DUTY",
    });

    // Close counter
    await prisma.$executeRaw`UPDATE counters SET current_user_id = NULL, status = 'CLOSED' WHERE id = ${counter.id}`;

    await deleteUser(prisma, staff.id, admin.id);

    const checkUser = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM users WHERE id = ${staff.id}
    `;
    expect(checkUser[0]?.count).toBe(0);
  });
});

