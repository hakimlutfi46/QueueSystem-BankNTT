"use client";

import { useActionState } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { loginAction } from "@/app/login/actions";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="mx-auto flex w-full max-w-md flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="flex flex-col gap-2 text-base font-bold">
        Nama pengguna
        <input
          name="username"
          autoComplete="username"
          required
          className="min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-base font-bold">
        Kata sandi
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3 font-normal"
        />
      </label>
      {state?.error ? (
        <p role="alert" className="font-bold text-danger">
          {state.error}
        </p>
      ) : null}
      <BrandButton type="submit" disabled={pending} className="w-full">
        {pending ? "Memeriksa…" : "Masuk"}
      </BrandButton>
    </form>
  );
}
