"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandButton } from "@/components/brand/brand-button";
import type { AdminService } from "@/lib/admin/services";
import { submitAdmin } from "@/app/admin/submit";

const field = "min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3";

export function ServicesScreen({ services }: { services: AdminService[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminService | null>(null);

  async function save(formData: FormData) {
    const body = {
      name: String(formData.get("name") ?? ""),
      prefix: String(formData.get("prefix") ?? ""),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "on",
    };
    const message = editing
      ? await submitAdmin(`/api/admin/services/${editing.id}`, "PATCH", body)
      : await submitAdmin("/api/admin/services", "POST", body);
    setError(message);
    if (!message) {
      setEditing(null);
      router.refresh();
    }
  }

  async function toggle(service: AdminService) {
    const message = await submitAdmin(`/api/admin/services/${service.id}`, "PATCH", {
      isActive: !service.isActive,
    });
    setError(message);
    if (!message) router.refresh();
  }

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold text-brand-navy">Layanan</h1>
      {error ? <p role="alert" className="mb-4 font-bold text-danger">{error}</p> : null}
      <form key={editing?.id ?? "new"} action={save} className="mb-6 grid gap-3 rounded-[var(--radius-card)] bg-brand-white p-4 sm:grid-cols-4">
        <label className="font-bold">
          Nama
          <input name="name" required defaultValue={editing?.name ?? ""} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Huruf awalan
          <input name="prefix" required maxLength={2} defaultValue={editing?.prefix ?? ""} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Urutan
          <input name="sortOrder" type="number" min={0} required defaultValue={editing?.sortOrder ?? services.length + 1} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="flex items-end gap-2 font-bold">
          <input name="isActive" type="checkbox" defaultChecked={editing?.isActive ?? true} />
          Aktif
        </label>
        <BrandButton type="submit">{editing ? "Simpan perubahan" : "Tambah layanan"}</BrandButton>
      </form>
      <ul className="flex flex-col gap-2">
        {services.map((service) => (
          <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-brand-white px-4 py-3">
            <span className="font-bold">
              {service.prefix} · {service.name}
              {service.isActive ? "" : " (nonaktif)"}
            </span>
            <span className="flex gap-2">
              <BrandButton variant="secondary" onClick={() => setEditing(service)}>Ubah</BrandButton>
              <BrandButton variant="secondary" onClick={() => void toggle(service)}>
                {service.isActive ? "Nonaktifkan" : "Aktifkan"}
              </BrandButton>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
