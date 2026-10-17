"use client";

import { useActionState, useState } from "react";
import { changePasswordAction } from "@/app/account/password/actions";
import { BrandButton } from "@/components/brand/brand-button";
import { inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function PasswordForm({ next, minLength }: { next: string; minLength: number }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const [visible, setVisible] = useState(false);
  const type = visible ? "text" : "password";

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Kata sandi sekarang
        <input name="current" type={type} autoComplete="current-password" required autoFocus className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Kata sandi baru
        <input name="password" type={type} autoComplete="new-password" required minLength={minLength} maxLength={80} className={inputClass} />
        <span className="font-normal text-ink-muted">
          Minimal {minLength} karakter. Jangan pakai nama pengguna, sandi bawaan, atau angka berurutan.
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Ulangi kata sandi baru
        <input name="confirm" type={type} autoComplete="new-password" required minLength={minLength} maxLength={80} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} className="size-4" />
        Tampilkan kata sandi
      </label>
      {state?.error ? (
        <p role="alert" className={cn("flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 font-bold text-danger")}>
          <Icon name="close" className="size-4" />
          {state.error}
        </p>
      ) : null}
      <BrandButton type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Menyimpan…" : "Simpan kata sandi baru"}
        {pending ? null : <Icon name="check" />}
      </BrandButton>
    </form>
  );
}
