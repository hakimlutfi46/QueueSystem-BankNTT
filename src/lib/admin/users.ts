import * as argon2 from "argon2";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError } from "@/lib/admin/errors";
import { errorText, notifyQueue } from "@/lib/queue/sql";

const userBody = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{3,40}$/),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(6).max(80).optional(),
  role: z.enum(["ADMIN", "STAFF"]),
  isActive: z.boolean().optional(),
});

export type AdminUser = {
  id: number;
  username: string;
  name: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
};

export async function listUsers(db: PrismaClient): Promise<AdminUser[]> {
  const rows = await db.$queryRaw<
    { id: number; username: string; name: string; role: string; is_active: boolean }[]
  >`
    SELECT id, username, name, role::text AS role, is_active
    FROM users
    ORDER BY username
  `;
  return rows.flatMap((row) => {
    if (row.role !== "ADMIN" && row.role !== "STAFF") return [];
    return [{ id: row.id, username: row.username, name: row.name, role: row.role, isActive: row.is_active }];
  });
}

export async function createUser(db: PrismaClient, body: unknown): Promise<AdminUser> {
  const parsed = userBody.safeParse(body);
  if (!parsed.success || !parsed.data.password) throw new AdminError("VALIDATION", "Data tidak valid.");
  const hash = await argon2.hash(parsed.data.password);
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO users (username, name, password_hash, role, is_active)
        VALUES (
          ${parsed.data.username},
          ${parsed.data.name},
          ${hash},
          ${parsed.data.role}::user_role,
          ${parsed.data.isActive ?? true}
        )
        RETURNING id
      `;
      const id = rows[0]?.id;
      if (!id) throw new AdminError("VALIDATION", "Data tidak valid.");
      await notifyQueue(tx, { type: "CONFIG_CHANGED" });
      const created = (await listUsers(tx as unknown as PrismaClient)).find((user) => user.id === id);
      if (!created) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
      return created;
    });
  } catch (error) {
    if (error instanceof AdminError) throw error;
    if (errorText(error).includes("users_username_key")) {
      throw new AdminError("USERNAME_TAKEN", "Nama pengguna sudah dipakai.");
    }
    throw error;
  }
}

export async function updateUser(
  db: PrismaClient,
  id: number,
  actorId: number,
  body: unknown,
): Promise<AdminUser> {
  const parsed = userBody.partial().safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    throw new AdminError("VALIDATION", "Data tidak valid.");
  }
  const existing = (await listUsers(db)).find((user) => user.id === id);
  if (!existing) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
  const nextRole = parsed.data.role ?? existing.role;
  const nextActive = parsed.data.isActive ?? existing.isActive;
  if (actorId === id && (nextRole !== "ADMIN" || !nextActive)) {
    throw new AdminError("CANNOT_CHANGE_SELF", "Anda tidak dapat menonaktifkan akun sendiri.");
  }
  const hash = parsed.data.password ? await argon2.hash(parsed.data.password) : null;
  try {
    return await db.$transaction(async (tx) => {
      if (hash) {
        await tx.$executeRaw`
          UPDATE users
          SET username = ${parsed.data.username ?? existing.username},
            name = ${parsed.data.name ?? existing.name},
            role = ${nextRole}::user_role,
            is_active = ${nextActive},
            password_hash = ${hash}
          WHERE id = ${id}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE users
          SET username = ${parsed.data.username ?? existing.username},
            name = ${parsed.data.name ?? existing.name},
            role = ${nextRole}::user_role,
            is_active = ${nextActive}
          WHERE id = ${id}
        `;
      }
      await notifyQueue(tx, { type: "CONFIG_CHANGED" });
      const updated = (await listUsers(tx as unknown as PrismaClient)).find((user) => user.id === id);
      if (!updated) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
      return updated;
    });
  } catch (error) {
    if (error instanceof AdminError) throw error;
    if (errorText(error).includes("users_username_key")) {
      throw new AdminError("USERNAME_TAKEN", "Nama pengguna sudah dipakai.");
    }
    throw error;
  }
}
