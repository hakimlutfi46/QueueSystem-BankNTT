import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createCounter, updateCounter } from "@/lib/admin/counters";
import { createService, updateService } from "@/lib/admin/services";
import { saveSettings } from "@/lib/admin/settings";
import { createUser, updateUser } from "@/lib/admin/users";
import { loadSessionUser } from "@/lib/auth/session";
import { callNext } from "@/lib/queue";
import { forceCloseCounter, openCounter } from "@/lib/queue/desk";
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

describe("admin CRUD", () => {
  it("explains which field is wrong instead of a generic message", async () => {
    await expect(createService(prisma, { name: "Kredit", prefix: "K1", sortOrder: 1 })).rejects.toMatchObject({
      code: "VALIDATION",
      message: expect.stringContaining("Huruf awalan"),
    });
    await expect(
      createUser(prisma, { username: "ab", name: "Budi", password: "rahasia", role: "STAFF" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("Nama pengguna 3–40") });
    await expect(
      createUser(prisma, { username: "budi", name: "Budi", password: "123", role: "STAFF" }),
    ).rejects.toMatchObject({ message: "Kata sandi minimal 6 karakter." });
    await expect(
      createUser(prisma, { username: "budi", name: "Budi", role: "STAFF" }),
    ).rejects.toMatchObject({ message: "Kata sandi wajib diisi untuk akun baru." });
    const service = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
    await expect(
      createCounter(prisma, { name: "Teller 1", displayNumber: 1, serviceIds: [] }),
    ).rejects.toMatchObject({ message: "Pilih minimal satu layanan." });
    await expect(updateService(prisma, service.id, {})).rejects.toMatchObject({ message: "Tidak ada yang diubah." });
    await expect(
      saveSettings(prisma, {
        branchName: "",
        runningText: "",
        voiceEnabled: true,
        maxRecall: 3,
        targetServiceMinutes: 10,
        ticketFooter: "",
        ticketWidthMm: 80,
      }),
    ).rejects.toMatchObject({ message: "Nama cabang wajib diisi." });
  });

  it("drops a deactivated or demoted account from the session right away", async () => {
    const admin = await createUser(prisma, { username: "kepala", name: "Kepala", password: "rahasia", role: "ADMIN" });
    const staff = await createUser(prisma, { username: "sari", name: "Sari", password: "rahasia", role: "STAFF" });
    await expect(loadSessionUser(prisma, staff.id)).resolves.toEqual({ id: staff.id, name: "Sari", role: "STAFF" });

    await updateUser(prisma, staff.id, admin.id, { name: "Sari Dewi" });
    await expect(loadSessionUser(prisma, staff.id)).resolves.toMatchObject({ name: "Sari Dewi" });

    await updateUser(prisma, staff.id, admin.id, { isActive: false });
    await expect(loadSessionUser(prisma, staff.id)).resolves.toBeNull();

    const second = await createUser(prisma, { username: "wakil", name: "Wakil", password: "rahasia", role: "ADMIN" });
    await updateUser(prisma, second.id, admin.id, { role: "STAFF" });
    await expect(loadSessionUser(prisma, second.id)).resolves.toMatchObject({ role: "STAFF" });
  });

  it("refuses to deactivate an officer who still holds a counter", async () => {
    const admin = await createUser(prisma, { username: "kepala", name: "Kepala", password: "rahasia", role: "ADMIN" });
    const staff = await createUser(prisma, { username: "sari", name: "Sari", password: "rahasia", role: "STAFF" });
    const service = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
    const counter = await createCounter(prisma, { name: "Teller 1", displayNumber: 1, serviceIds: [service.id] });
    await openCounter(prisma, { counterId: counter.id, userId: staff.id });

    await expect(updateUser(prisma, staff.id, admin.id, { isActive: false })).rejects.toMatchObject({
      code: "USER_ON_DUTY",
      message: expect.stringContaining("Teller 1"),
    });

    await forceCloseCounter(prisma, { counterId: counter.id, adminId: admin.id });
    await expect(updateUser(prisma, staff.id, admin.id, { isActive: false })).resolves.toMatchObject({ isActive: false });
  });

  it("lets an admin close a counter the officer left open, auto-closing its ticket", async () => {
    const admin = await createUser(prisma, { username: "kepala", name: "Kepala", password: "rahasia", role: "ADMIN" });
    const staff = await createUser(prisma, { username: "sari", name: "Sari", password: "rahasia", role: "STAFF" });
    const service = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
    const counter = await createCounter(prisma, { name: "Teller 1", displayNumber: 1, serviceIds: [service.id] });
    await openCounter(prisma, { counterId: counter.id, userId: staff.id });
    await prisma.$executeRaw`
      INSERT INTO tickets (request_id, service_id, service_date, seq, number)
      VALUES (${randomUUID()}::uuid, ${service.id}, (now() AT TIME ZONE 'Asia/Makassar')::date, 1, 'B001')
    `;
    await callNext(prisma, { counterId: counter.id, userId: staff.id });

    await expect(updateCounter(prisma, counter.id, { isActive: false })).rejects.toMatchObject({ code: "COUNTER_BUSY" });

    const result = await forceCloseCounter(prisma, { counterId: counter.id, adminId: admin.id });
    expect(result).toEqual({ id: counter.id, status: "CLOSED", autoClosedTicket: "B001" });

    const tickets = await prisma.$queryRaw<{ status: string; auto_closed: boolean; finished_at: Date | null }[]>`
      SELECT status::text AS status, auto_closed, finished_at FROM tickets
    `;
    expect(tickets[0]).toMatchObject({ status: "DONE", auto_closed: true });
    expect(tickets[0]?.finished_at).not.toBeNull();
    const counters = await prisma.$queryRaw<{ status: string; current_user_id: number | null }[]>`
      SELECT status::text AS status, current_user_id FROM counters WHERE id = ${counter.id}
    `;
    expect(counters[0]).toEqual({ status: "CLOSED", current_user_id: null });

    await expect(updateCounter(prisma, counter.id, { isActive: false })).resolves.toMatchObject({ isActive: false });
    await expect(forceCloseCounter(prisma, { counterId: counter.id, adminId: admin.id })).resolves.toMatchObject({
      autoClosedTicket: null,
    });
  });

  it("keeps a link to an inactive service when only the name changes", async () => {
    const teller = await createService(prisma, { name: "Teller", prefix: "B", sortOrder: 1 });
    const counter = await createCounter(prisma, { name: "Teller 1", displayNumber: 1, serviceIds: [teller.id] });
    await updateService(prisma, teller.id, { isActive: false });
    const renamed = await updateCounter(prisma, counter.id, { name: "Teller Utama" });
    expect(renamed.serviceIds).toEqual([teller.id]);
  });
});
