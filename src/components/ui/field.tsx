import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-brand-white px-3 text-base font-normal text-ink transition-colors placeholder:text-ink-muted/70 hover:border-brand-grey focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-sky-soft";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm font-bold text-ink", className)}>
      {label}
      {children}
      {hint ? <span className="text-xs font-normal text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export function Switch({
  name,
  label,
  description,
  defaultChecked,
  checked,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  /** Bentuk terkendali: dipakai bila perubahan langsung disimpan, tanpa tombol Simpan. */
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-brand-white p-4 hover:border-brand-grey">
      <span>
        <span className="block font-bold">{label}</span>
        {description ? <span className="mt-0.5 block text-sm text-ink-muted">{description}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={checked === undefined ? defaultChecked : undefined}
          checked={checked}
          disabled={disabled}
          onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
          className="peer absolute inset-0 z-10 cursor-pointer appearance-none opacity-0"
        />
        <span className="h-7 w-12 rounded-full bg-line transition-colors peer-checked:bg-brand-navy peer-focus-visible:ring-4 peer-focus-visible:ring-sky-soft" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-brand-white shadow-card transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** Pilihan bertanda centang yang tampil sebagai chip; tetap checkbox biasa untuk form dan pembaca layar. */
export function ChipCheckbox({
  name,
  value,
  label,
  defaultChecked,
  checked,
  onChange,
  leading,
}: {
  name?: string;
  value: string | number;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  leading?: ReactNode;
}) {
  return (
    <label className="group relative inline-flex cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
        className="peer absolute inset-0 z-10 cursor-pointer appearance-none rounded-full opacity-0"
      />
      <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-brand-white px-3 text-sm font-bold text-ink-muted transition-colors group-hover:border-brand-blue peer-checked:border-brand-navy peer-checked:bg-navy-soft peer-checked:text-brand-navy peer-focus-visible:ring-4 peer-focus-visible:ring-sky-soft">
        {leading}
        {label}
      </span>
    </label>
  );
}
