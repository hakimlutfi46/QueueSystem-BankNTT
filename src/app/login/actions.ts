"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { clientAddress, longestWait, loginRateLimit, waitText, type RateLimit } from "@/lib/auth/rate-limit";
import { getPrisma } from "@/lib/db";

export type LoginState = { error: string } | null;

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const callback = String(formData.get("callbackUrl") ?? "");

  // Tebakan kata sandi dibatasi sebelum sandi diperiksa, jadi akun yang terkunci tidak membocorkan apa pun.
  const address = clientAddress(await headers());
  const account = username.trim().toLowerCase();
  const checks: [RateLimit, string][] = [
    [loginRateLimit.perAccountAddress, `${address}|${account}`],
    [loginRateLimit.perAccount, account],
    [loginRateLimit.perAddress, address],
  ];
  const wait = longestWait(checks);
  if (wait > 0) {
    return { error: `Terlalu banyak percobaan yang salah. Coba lagi dalam ${waitText(wait)}.` };
  }

  const redirectTo =
    callback.startsWith("/") && !callback.startsWith("//") ? callback : await homeFor(username);

  try {
    await signIn("credentials", { username, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      for (const [limit, key] of checks) limit.fail(key);
      return { error: "Nama pengguna atau kata sandi salah." };
    }
    // Berhasil: signIn melempar pengalihan ke halaman tujuan.
    loginRateLimit.perAccountAddress.reset(`${address}|${account}`);
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
