import "dotenv/config";
import * as argon2 from "argon2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createUser, listUsers, updateUser } from "@/lib/admin/users";
import { authenticate } from "@/lib/auth/credentials";
import { loadSessionUser } from "@/lib/auth/session";
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
  await prisma.$executeRaw`TRUNCATE TABLE ticket_events, tickets, counter_services, counters, users RESTART IDENTITY CASCADE`;
});

async function mustChange(id: number): Promise<boolean | undefined> {
  return (await loadSessionUser(prisma, id))?.mustChangePassword;
}

describe("temporary and weak passwords", () => {
  it("marks admin-set passwords as temporary, except when admins reset their own", async () => {
    const admin = await createUser(prisma, { username: "kepala", name: "Kepala", password: "Sementara-1", role: "ADMIN" });
    const staff = await createUser(prisma, { username: "sari", name: "Sari", password: "Sementara-2", role: "STAFF" });
    expect(await mustChange(staff.id)).toBe(true);
    expect((await listUsers(prisma)).find((user) => user.id === staff.id)?.mustChangePassword).toBe(true);

    await prisma.$executeRaw`UPDATE users SET must_change_password = false`;
    await updateUser(prisma, staff.id, admin.id, { name: "Sari Dewi" });
    expect(await mustChange(staff.id)).toBe(false);

    await updateUser(prisma, staff.id, admin.id, { password: "Reset-Admin-3" });
    expect(await mustChange(staff.id)).toBe(true);

    await updateUser(prisma, admin.id, admin.id, { password: "Pilihan-Sendiri-4" });
    expect(await mustChange(admin.id)).toBe(false);
  });

  it("flags an account that signs in with a weak password but leaves a strong one alone", async () => {
    const weak = await argon2.hash("Password123");
    const strong = await argon2.hash("Kupang-Lobi-2026");
    await prisma.$executeRaw`
      INSERT INTO users (username, name, password_hash, role) VALUES
        ('admin', 'Admin', ${weak}, 'ADMIN'),
        ('teller', 'Teller', ${strong}, 'STAFF')
    `;
    await expect(authenticate("admin", "Password123", prisma)).resolves.toMatchObject({ role: "ADMIN" });
    await expect(authenticate("teller", "Kupang-Lobi-2026", prisma)).resolves.toMatchObject({ role: "STAFF" });
    const rows = await prisma.$queryRaw<{ username: string; must_change_password: boolean }[]>`
      SELECT username, must_change_password FROM users ORDER BY username
    `;
    expect(rows).toEqual([
      { username: "admin", must_change_password: true },
      { username: "teller", must_change_password: false },
    ]);
  });
});
