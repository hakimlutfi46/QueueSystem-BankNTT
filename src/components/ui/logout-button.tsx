"use client";

import { useRef, type ReactNode } from "react";
import { logout } from "@/app/counter/actions";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Tombol keluar dengan konfirmasi. `warning` dipakai untuk menjelaskan akibatnya, misalnya loket yang
 * masih buka tetap terbuka atas nama petugas ini sampai ditutup.
 */
export function LogoutButton({
  className,
  ariaLabel = "Keluar",
  warning,
  children,
}: {
  className?: string;
  ariaLabel?: string;
  warning?: ReactNode;
  children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const { confirm, dialog } = useConfirm();

  return (
    <>
      <form ref={form} action={logout}>
        <button
          type="button"
          className={className}
          aria-label={ariaLabel}
          title="Keluar"
          onClick={async () => {
            const ok = await confirm({
              title: "Keluar dari akun?",
              message: warning ?? "Anda perlu masuk lagi untuk membuka halaman ini.",
              confirmLabel: "Keluar",
              icon: "logout",
            });
            if (ok) form.current?.requestSubmit();
          }}
        >
          {children}
        </button>
      </form>
      {dialog}
    </>
  );
}
