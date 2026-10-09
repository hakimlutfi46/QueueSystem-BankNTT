"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Modal } from "@/components/ui/panel";

export type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** "danger" untuk aksi yang menghapus, mematikan, atau mengeluarkan; "primary" untuk perubahan biasa. */
  tone?: "danger" | "primary";
  icon?: IconName;
};

/**
 * Pop-up konfirmasi untuk aksi sensitif. `confirm()` mengembalikan janji yang bernilai true bila
 * pengguna menekan tombol konfirmasi, false bila membatalkan, menekan Escape, atau mengklik latar.
 * Tempatkan `dialog` di dalam JSX komponen yang memakainya.
 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // Pop-up sebelumnya yang belum dijawab dianggap batal.
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const dialog = options ? (
    <Modal title={options.title} onClose={() => settle(false)}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span
            className={
              options.tone === "primary"
                ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-soft text-brand-navy"
                : "flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
            }
            aria-hidden="true"
          >
            <Icon name={options.icon ?? (options.tone === "primary" ? "check" : "power")} />
          </span>
          <div className="pt-1.5 text-sm leading-relaxed text-ink">{options.message}</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <BrandButton variant="ghost" onClick={() => settle(false)}>
            Batal
          </BrandButton>
          <BrandButton variant={options.tone === "primary" ? "primary" : "danger"} onClick={() => settle(true)}>
            {options.confirmLabel}
          </BrandButton>
        </div>
      </div>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
