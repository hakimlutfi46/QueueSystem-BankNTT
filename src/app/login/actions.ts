"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error: string } | null;

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const callback = String(formData.get("callbackUrl") ?? "/counter");
  const redirectTo = callback.startsWith("/") && !callback.startsWith("//") ? callback : "/counter";

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
