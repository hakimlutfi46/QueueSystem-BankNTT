"use client";

import { useActionState, useState } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { loginAction } from "@/app/login/actions";
import { cn } from "@/lib/cn";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const [visible, setVisible] = useState(false);
  // React 19 mengosongkan isian form setelah aksi selesai. Nama pengguna dikendalikan state supaya tetap
  // terisi setelah kata sandi salah; tanpa ini percobaan kedua tidak terkirim karena kolomnya wajib.
  const [username, setUsername] = useState("");

  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Nama pengguna
        <span className="relative">
          <Icon name="user" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
            autoFocus
            className={cn(inputClass, "pl-11")}
          />
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Kata sandi
        <span className="relative">
          <Icon name="lock" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            className={cn(inputClass, "px-11")}
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-brand-blue hover:bg-navy-soft"
            aria-label={visible ? "Sembunyikan sandi" : "Lihat sandi"}
          >
            {visible ? "Sembunyikan" : "Lihat"}
          </button>
        </span>
      </label>
      {state?.error ? (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 font-bold text-danger">
          <Icon name="close" className="size-4" />
          {state.error}
        </p>
      ) : null}
      <BrandButton type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Memeriksa…" : "Masuk"}
        {pending ? null : <Icon name="arrowRight" />}
      </BrandButton>
    </form>
  );
}
