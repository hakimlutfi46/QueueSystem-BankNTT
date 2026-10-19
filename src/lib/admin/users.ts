import * as argon2 from "argon2";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError, validationError } from "@/lib/admin/errors";
import { errorText, notifyQueue } from "@/lib/queue/sql";

const userBody = z.object({
  username: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9._-]{3,40}$/,
      "Nama pengguna 3–40 karakter: huruf, angka, titik, garis bawah, atau strip, tanpa spasi.",
    ),
  name: z.string().trim().min(1, "Nama wajib diisi.").max(80, "Nama paling panjang 80 karakter."),
  password: z
    .string()
    .min(6, "Kata sandi minimal 6 karakter.")
    .max(80, "Kata sandi paling panjang 80 karakter.")
    .optional(),
  role: z.enum(["ADMIN", "STAFF"], { error: "Peran harus Admin atau Petugas." }),
  isActive: z.boolean().optional(),
});

export type AdminUser = {
  id: number;
  username: string;
  name: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
  /** Masih memakai sandi sementara, bawaan, atau lemah. */
  mustChangePassword: boolean;
};

export async function listUsers(db: PrismaClient): Promise<AdminUser[]> {
  const rows = await db.$queryRaw<
    { id: number; username: string; name: string; role: string; is_active: boolean; must_change_password: boolean }[]
  >`
    SELECT id, username, name, role::text AS role, is_active, must_change_password
    FROM users
    ORDER BY username
  `;
  return rows.flatMap((row) => {
    if (row.role !== "ADMIN" && row.role !== "STAFF") return [];
    return [
      {
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        isActive: row.is_active,
        mustChangePassword: row.must_change_password,
      },
    ];
  });
}

/**
 * Akun baru dari admin memakai sandi sementara: pemiliknya wajib menggantinya saat pertama masuk.
 * Begitu juga sandi yang direset admin untuk akun orang lain.
 */
export async function createUser(db: PrismaClient, body: unknown): Promise<AdminUser> {
  const parsed = userBody.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  if (!parsed.data.password) throw new AdminError("VALIDATION", "Kata sandi wajib diisi untuk akun baru.");
  const hash = await argon2.hash(parsed.data.password);
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO users (username, name, password_hash, role, is_active, must_change_password)
        VALUES (
          ${parsed.data.username},
          ${parsed.data.name},
          ${hash},
          ${parsed.data.role}::user_role,
          ${parsed.data.isActive ?? true},
          true
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
  if (!parsed.success) throw validationError(parsed.error);
  if (Object.keys(parsed.data).length === 0) throw new AdminError("VALIDATION", "Tidak ada yang diubah.");
  const existing = (await listUsers(db)).find((user) => user.id === id);
  if (!existing) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
  const nextRole = parsed.data.role ?? existing.role;
  const nextActive = parsed.data.isActive ?? existing.isActive;
  if (actorId === id && (nextRole !== "ADMIN" || !nextActive)) {
    throw new AdminError("CANNOT_CHANGE_SELF", "Anda tidak dapat menonaktifkan akun sendiri.");
  }
  if (existing.isActive && !nextActive) {
    const held = await db.$queryRaw<{ name: string }[]>`
      SELECT name FROM counters
      WHERE current_user_id = ${id} AND status IN ('OPEN', 'PAUSED')
      LIMIT 1
    `;
    if (held[0]) {
      throw new AdminError(
        "USER_ON_DUTY",
        `${existing.name} masih memegang ${held[0].name}. Tutup paksa loket itu dulu dari menu Loket.`,
      );
    }
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
            password_hash = ${hash},
            must_change_password = ${actorId !== id}
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

export async function deleteUser(db: PrismaClient, id: number, actorId: number): Promise<void> {
  if (actorId === id) {
    throw new AdminError("CANNOT_DELETE_SELF", "Anda tidak dapat menghapus akun Anda sendiri.");
  }
  const existing = (await listUsers(db)).find((user) => user.id === id);
  if (!existing) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");

  const held = await db.$queryRaw<{ name: string }[]>`
    SELECT name FROM counters
    WHERE current_user_id = ${id} AND status IN ('OPEN', 'PAUSED')
    LIMIT 1
  `;
  if (held[0]) {
    throw new AdminError(
      "USER_ON_DUTY",
      `${existing.name} masih memegang ${held[0].name}. Tutup paksa loket itu dulu dari menu Loket.`,
    );
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE counters SET current_user_id = NULL WHERE current_user_id = ${id}`;
    await tx.$executeRaw`UPDATE tickets SET served_by = NULL WHERE served_by = ${id}`;
    await tx.$executeRaw`UPDATE ticket_events SET user_id = NULL WHERE user_id = ${id}`;
    await tx.$executeRaw`DELETE FROM users WHERE id = ${id}`;
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
  });
}

