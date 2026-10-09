import type { PrismaClient } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/db";

export type SessionUser = {
  id: number;
  name: string;
  role: "ADMIN" | "STAFF";
};

/**
 * Pengguna yang sedang masuk, dibaca ulang dari database. Sesi JWT hanya menyimpan id, jadi akun yang
 * dinonaktifkan, diturunkan perannya, atau diganti namanya oleh admin langsung berlaku tanpa menunggu sesi habis.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!session?.user || !Number.isInteger(id) || id <= 0) return null;
  return loadSessionUser(getPrisma(), id);
}

export async function loadSessionUser(db: PrismaClient, id: number): Promise<SessionUser | null> {
  const rows = await db.$queryRaw<{ name: string; role: string }[]>`
    SELECT name, role::text AS role FROM users WHERE id = ${id} AND is_active LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id, name: row.name, role: row.role === "ADMIN" ? "ADMIN" : "STAFF" };
}

export async function currentOfficer(): Promise<{ id: number; name: string } | null> {
  const user = await currentUser();
  if (!user) return null;
  return { id: user.id, name: user.name };
}

export function adminDenied(user: SessionUser | null): Response | null {
  if (!user) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Silakan masuk." } },
      { status: 401 },
    );
  }
  if (user.role !== "ADMIN") {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "Halaman ini hanya untuk admin." } },
      { status: 403 },
    );
  }
  return null;
}
