"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getPrisma } from "@/lib/db";

export type LoginState = { error: string } | null;

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const callback = String(formData.get("callbackUrl") ?? "");
  const redirectTo =
    callback.startsWith("/") && !callback.startsWith("//") ? callback : await homeFor(username);

  try {
    await signIn("credentials", { username, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Nama pengguna atau kata sandi salah." };
    }
    throw error;
  }
  return null;
}

/**
 * Tujuan bila halaman masuk dibuka tanpa tujuan: admin ke panel admin, petugas ke layar loket.
 * Kata sandi tetap diperiksa oleh signIn; di sini hanya peran yang dibaca.
 */
async function homeFor(username: string): Promise<string> {
  const rows = await getPrisma().$queryRaw<{ role: string }[]>`
    SELECT role::text AS role FROM users WHERE username = ${username.trim()} AND is_active LIMIT 1
  `;
  return rows[0]?.role === "ADMIN" ? "/admin" : "/counter";
}
