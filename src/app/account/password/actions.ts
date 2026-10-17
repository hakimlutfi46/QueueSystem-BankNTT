"use server";

import * as argon2 from "argon2";
import { redirect } from "next/navigation";
import { newPasswordProblem } from "@/lib/auth/password-policy";
import { loginRateLimit, waitText } from "@/lib/auth/rate-limit";
import { currentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";

export type ChangePasswordState = { error: string } | null;

/** Ganti kata sandi sendiri. Sandi sekarang wajib benar, dan tebakannya dibatasi seperti saat masuk. */
export async function changePasswordAction(_state: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const limitKey = `password-change|${user.id}`;
  const wait = loginRateLimit.perAccountAddress.blockedFor(limitKey);
  if (wait > 0) return { error: `Terlalu banyak percobaan yang salah. Coba lagi dalam ${waitText(wait)}.` };

  const db = getPrisma();
  const rows = await db.$queryRaw<{ username: string; password_hash: string }[]>`
    SELECT username, password_hash FROM users WHERE id = ${user.id} AND is_active LIMIT 1
  `;
  const row = rows[0];
  if (!row) redirect("/login");
  const matches = await argon2.verify(row.password_hash, current).catch(() => false);
  if (!matches) {
    loginRateLimit.perAccountAddress.fail(limitKey);
    return { error: "Kata sandi sekarang salah." };
  }
  const problem = newPasswordProblem({ password, confirm, username: row.username, current });
  if (problem) return { error: problem };

  const hash = await argon2.hash(password);
  await db.$executeRaw`
    UPDATE users SET password_hash = ${hash}, must_change_password = false WHERE id = ${user.id}
  `;
  loginRateLimit.perAccountAddress.reset(limitKey);
  redirect(safeNext(String(formData.get("next") ?? ""), user.role));
}

function safeNext(next: string, role: "ADMIN" | "STAFF"): string {
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/account")) {
    if (!(next.startsWith("/admin") && role !== "ADMIN")) return next;
  }
  return role === "ADMIN" ? "/admin" : "/counter";
}
