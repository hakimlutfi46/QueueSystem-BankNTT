"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandButton } from "@/components/brand/brand-button";
import type { AdminCounter } from "@/lib/admin/counters";
import type { AdminService } from "@/lib/admin/services";
import { submitAdmin } from "@/app/admin/submit";

const field = "min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3";

export function CountersScreen({
  counters,
  services,
}: {
  counters: AdminCounter[];
  services: AdminService[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const activeServices = services.filter((service) => service.isActive);

  async function save(formData: FormData) {
    const serviceIds = formData.getAll("serviceId").map((value) => Number(value));
    const body = {
      name: String(formData.get("name") ?? ""),
      displayNumber: Number(formData.get("displayNumber") ?? 0),
      serviceIds,
    };
    const message = await submitAdmin("/api/admin/counters", "POST", body);
    setError(message);
    if (!message) router.refresh();
  }

  async function toggle(counter: AdminCounter) {
    const message = await submitAdmin(`/api/admin/counters/${counter.id}`, "PATCH", {
      isActive: !counter.isActive,
    });
    setError(message);
    if (!message) router.refresh();
  }

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold text-brand-navy">Loket</h1>
      {error ? <p role="alert" className="mb-4 font-bold text-danger">{error}</p> : null}
      <form action={save} className="mb-6 flex flex-col gap-3 rounded-[var(--radius-card)] bg-brand-white p-4">
        <label className="font-bold">
          Nama loket
          <input name="name" required className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Nomor tampil
          <input name="displayNumber" type="number" min={1} required className={`${field} mt-1 w-full font-normal`} />
        </label>
        <fieldset>
          <legend className="font-bold">Layanan yang dilayani</legend>
          <div className="mt-2 flex flex-col gap-2">
            {activeServices.map((service) => (
              <label key={service.id} className="flex items-center gap-2">
                <input type="checkbox" name="serviceId" value={service.id} />
                {service.name}
              </label>
            ))}
          </div>
        </fieldset>
        <BrandButton type="submit">Simpan loket</BrandButton>
      </form>
      <ul className="flex flex-col gap-2">
        {counters.map((counter) => (
          <li key={counter.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-brand-white px-4 py-3">
            <span>
              <span className="font-bold">{counter.name}</span>
              <span className="text-ink-muted"> · tampil {counter.displayNumber} · {counter.status}</span>
              {counter.isActive ? "" : " · nonaktif"}
            </span>
            <span className="flex gap-2">
              <CounterEditor counter={counter} services={activeServices} onSaved={() => router.refresh()} onError={setError} />
              <BrandButton variant="secondary" onClick={() => void toggle(counter)}>
                {counter.isActive ? "Nonaktifkan" : "Aktifkan"}
              </BrandButton>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CounterEditor({
  counter,
  services,
  onSaved,
  onError,
}: {
  counter: AdminCounter;
  services: AdminService[];
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <BrandButton variant="secondary" onClick={() => setOpen(true)}>Ubah</BrandButton>;
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      action={async (formData) => {
        const message = await submitAdmin(`/api/admin/counters/${counter.id}`, "PATCH", {
          name: String(formData.get("name") ?? ""),
          displayNumber: Number(formData.get("displayNumber") ?? 0),
          serviceIds: formData.getAll("serviceId").map((value) => Number(value)),
        });
        onError(message);
        if (!message) {
          setOpen(false);
          onSaved();
        }
      }}
    >
      <input name="name" required defaultValue={counter.name} aria-label={`Nama ${counter.name}`} className={field} />
      <input name="displayNumber" type="number" min={1} required defaultValue={counter.displayNumber} aria-label={`Nomor tampil ${counter.name}`} className={field} />
      {services.map((service) => (
        <label key={service.id} className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="serviceId" value={service.id} defaultChecked={counter.serviceIds.includes(service.id)} />
          {service.name}
        </label>
      ))}
      <BrandButton type="submit">Simpan</BrandButton>
    </form>
  );
}
