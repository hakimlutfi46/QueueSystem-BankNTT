import * as argon2 from "argon2";
import type { PrismaClient } from "@/generated/prisma/client";
import { isWeakPassword, weakPasswordsAllowed } from "@/lib/auth/password-policy";
import { getPrisma } from "@/lib/db";

export type AuthenticatedUser = {
  id: string;
  name: string;
  role: "ADMIN" | "STAFF";
};

export async function authenticate(
  username: string,
  password: string,
  db: PrismaClient = getPrisma(),
): Promise<AuthenticatedUser | null> {
  const name = username.trim();
  if (!name || !password) return null;

  const rows = await db.$queryRaw<
    { id: number; name: string; password_hash: string; role: string }[]
  >`
    SELECT id, name, password_hash, role::text AS role
    FROM users
    WHERE username = ${name} AND is_active
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || (user.role !== "ADMIN" && user.role !== "STAFF")) return null;

  try {
    const matches = await argon2.verify(user.password_hash, password);
    if (!matches) return null;
  } catch {
    return null;
  }

  // Sandi bawaan atau lemah tetap diterima sekali, lalu akun wajib menggantinya sebelum bekerja.
  if (!weakPasswordsAllowed() && isWeakPassword(password, name)) {
    await db.$executeRaw`UPDATE users SET must_change_password = true WHERE id = ${user.id}`;
  }

  return { id: String(user.id), name: user.name, role: user.role };
}
