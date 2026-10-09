"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAdmin } from "@/app/admin/submit";
import { useLiveRefresh } from "@/app/admin/use-live-refresh";
import { BrandButton } from "@/components/brand/brand-button";
import { Badge, PrefixTile } from "@/components/ui/badge";
import { ChipCheckbox, Field, Switch, inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Alert, EmptyState, Modal, PageHeader, Panel } from "@/components/ui/panel";
import type { AdminCounter } from "@/lib/admin/counters";
import type { AdminService } from "@/lib/admin/services";
import { cn } from "@/lib/cn";
import { useQueueState } from "@/lib/realtime/use-queue-state";

type ServiceBody = { name: string; prefix: string; sortOrder: number; isActive: boolean };

function readServiceForm(formData: FormData): ServiceBody {
  return {
    name: String(formData.get("name") ?? ""),
    prefix: String(formData.get("prefix") ?? ""),
    sortOrder: Number(formData.get("sortOrder") ?? 0),
    isActive: formData.get("isActive") === "on",
  };
}

export function ServicesScreen({
  services,
  counters,
}: {
  services: AdminService[];
  counters: AdminCounter[];
}) {
  const router = useRouter();
  const { state } = useQueueState();
  useLiveRefresh(["CONFIG_CHANGED", "COUNTER_CHANGED"]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminService | null>(null);
  const [assigning, setAssigning] = useState<AdminService | null>(null);
  const [formKey, setFormKey] = useState(0);

  const waitingById = new Map((state?.services ?? []).map((service) => [service.id, service.waitingCount]));
  const nextPrefix = suggestPrefix(services);

  function done(message: string | null, success: string): boolean {
    setError(message);
    setNotice(message ? null : success);
    if (!message) router.refresh();
    return !message;
  }

  async function create(formData: FormData) {
    const body = readServiceForm(formData);
    if (done(await submitAdmin("/api/admin/services", "POST", body), `${body.name} ditambahkan.`)) {
      setFormKey((key) => key + 1);
    }
  }

  async function toggle(service: AdminService) {
    const message = await submitAdmin(`/api/admin/services/${service.id}`, "PATCH", { isActive: !service.isActive });
    done(message, service.isActive ? `${service.name} disembunyikan dari kiosk.` : `${service.name} tampil lagi di kiosk.`);
  }

  return (
    <section>
      <PageHeader
        title="Layanan"
        description="Jenis antrian yang bisa dipilih nasabah di kiosk. Tiap layanan punya huruf awalan sendiri untuk nomornya."
      />
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {services.length === 0 ? (
            <EmptyState icon="layers" title="Belum ada layanan" description="Tambahkan layanan pertama dari panel di samping." />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {services.map((service) => {
                const serving = counters.filter(
                  (counter) => counter.isActive && counter.serviceIds.includes(service.id),
                );
                const open = serving.filter((counter) => {
                  const live = state?.counters.find((item) => item.id === counter.id);
                  return (live?.status ?? counter.status) === "OPEN";
                });
                return (
                  <li key={service.id}>
                    <article
                      className={cn(
                        "flex h-full flex-col rounded-[var(--radius-card)] border bg-brand-white p-4 shadow-card",
                        service.isActive ? "border-line" : "border-dashed border-line opacity-70",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <PrefixTile prefix={service.prefix} className="size-14 text-2xl" />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-lg font-bold text-brand-navy">{service.name}</h3>
                          <p className="text-sm text-ink-muted">
                            Nomor {service.prefix}001, {service.prefix}002, … · urutan {service.sortOrder}
                          </p>
                        </div>
                        {service.isActive ? (
                          <Badge tone="success" dot>Tampil di kiosk</Badge>
                        ) : (
                          <Badge tone="muted" dot>Disembunyikan</Badge>
                        )}
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface p-3 text-sm">
                        <div>
                          <dt className="text-ink-muted">Menunggu sekarang</dt>
                          <dd className="text-xl font-bold text-brand-navy tabular-nums">
                            {service.isActive ? (waitingById.get(service.id) ?? 0) : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-muted">Loket buka</dt>
                          <dd className="text-xl font-bold text-brand-navy tabular-nums">
                            {open.length}
                            <span className="text-sm font-normal text-ink-muted"> dari {serving.length}</span>
                          </dd>
                        </div>
                      </dl>
                      {serving.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
                          <span className="font-bold text-ink-muted">Dilayani di:</span>
                          <ul className="contents" aria-label={`Loket yang melayani ${service.name}`}>
                            {serving.map((counter) => (
                              <li key={counter.id}>
                                <Badge tone="sky">{counter.name}</Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {service.isActive && serving.length === 0 ? (
                        <p className="mt-3 flex items-center gap-2 rounded-xl bg-orange-soft px-3 py-2 text-sm font-bold text-ink">
                          <Icon name="desk" className="size-4" />
                          Belum ada loket yang melayani layanan ini.
                        </p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <BrandButton size="sm" variant="outline" onClick={() => setEditing(service)} ariaLabel={`Ubah ${service.name}`}>
                          <Icon name="edit" className="size-4" />
                          Ubah
                        </BrandButton>
                        <BrandButton
                          size="sm"
                          variant="outline"
                          onClick={() => setAssigning(service)}
                          ariaLabel={`Atur loket untuk ${service.name}`}
                        >
                          <Icon name="desk" className="size-4" />
                          Atur loket
                        </BrandButton>
                        <BrandButton
                          size="sm"
                          variant={service.isActive ? "danger" : "outline"}
                          onClick={() => void toggle(service)}
                        >
                          <Icon name="power" className="size-4" />
                          {service.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </BrandButton>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <Panel title="Tambah layanan" description="Misalnya Kredit, Prioritas, atau Pembukaan Rekening.">
            <form key={formKey} action={create} className="flex flex-col gap-4">
              <ServiceFields defaults={{ name: "", prefix: nextPrefix, sortOrder: services.length + 1, isActive: true }} />
              <BrandButton type="submit">
                <Icon name="plus" />
                Tambah layanan
              </BrandButton>
            </form>
          </Panel>
        </div>
      </div>

      {editing ? (
        <Modal title={`Ubah ${editing.name}`} onClose={() => setEditing(null)}>
          <form
            className="flex flex-col gap-4"
            action={async (formData) => {
              const body = readServiceForm(formData);
              const message = await submitAdmin(`/api/admin/services/${editing.id}`, "PATCH", body);
              if (done(message, `${body.name} disimpan.`)) setEditing(null);
            }}
          >
            <ServiceFields defaults={editing} />
            <p className="text-xs text-ink-muted">
              Mengganti huruf awalan hanya berlaku untuk tiket baru. Tiket yang sudah dicetak tetap memakai huruf lama.
            </p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <BrandButton variant="ghost" onClick={() => setEditing(null)}>
                Batal
              </BrandButton>
              <BrandButton type="submit">Simpan perubahan</BrandButton>
            </div>
          </form>
        </Modal>
      ) : null}

      {assigning ? (
        <AssignCountersModal
          service={assigning}
          counters={counters}
          onClose={() => setAssigning(null)}
          onSave={async (counterIds) => {
            const message = await submitAdmin(`/api/admin/services/${assigning.id}/counters`, "PUT", { counterIds });
            if (done(message, `Loket untuk ${assigning.name} disimpan.`)) setAssigning(null);
            return message;
          }}
        />
      ) : null}
    </section>
  );
}

function AssignCountersModal({
  service,
  counters,
  onClose,
  onSave,
}: {
  service: AdminService;
  counters: AdminCounter[];
  onClose: () => void;
  onSave: (counterIds: number[]) => Promise<string | null>;
}) {
  const active = counters.filter((counter) => counter.isActive);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(active.filter((counter) => counter.serviceIds.includes(service.id)).map((counter) => counter.id)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = groupCounters(active);

  function toggle(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectPrefix(prefix: string) {
    const matching = active.filter((counter) => counter.name.trim().toLowerCase().startsWith(prefix.toLowerCase()));
    setSelected((current) => new Set([...current, ...matching.map((counter) => counter.id)]));
  }

  return (
    <Modal
      title={`Atur loket untuk ${service.name}`}
      description="Centang loket yang boleh memanggil nomor layanan ini. Satu loket bisa melayani beberapa layanan."
      onClose={onClose}
      wide
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          const message = await onSave([...selected].sort((a, b) => a - b));
          setSaving(false);
          setError(message);
        }}
      >
        {error ? <Alert>{error}</Alert> : null}
        {active.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada loket aktif. Tambahkan loket dulu di menu Loket.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <BrandButton size="sm" variant="outline" onClick={() => selectPrefix("CS")}>
                Pilih semua CS
              </BrandButton>
              <BrandButton size="sm" variant="outline" onClick={() => selectPrefix("Teller")}>
                Pilih semua Teller
              </BrandButton>
              <BrandButton size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Kosongkan
              </BrandButton>
            </div>
            {groups.map((group) => (
              <fieldset key={group.label} className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-bold text-brand-navy">{group.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {group.counters.map((counter) => (
                    <ChipCheckbox
                      key={counter.id}
                      value={counter.id}
                      label={counter.name}
                      checked={selected.has(counter.id)}
                      onChange={(checked) => toggle(counter.id, checked)}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
            <p className="text-sm text-ink-muted" aria-live="polite">
              {selected.size === 0
                ? "Belum ada loket dipilih. Nomor layanan ini tidak akan dipanggil."
                : `${selected.size} loket dipilih.`}
            </p>
          </>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <BrandButton variant="ghost" onClick={onClose}>
            Batal
          </BrandButton>
          <BrandButton type="submit" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan loket"}
          </BrandButton>
        </div>
      </form>
    </Modal>
  );
}

/** Mengelompokkan loket berdasarkan nama tanpa nomor di belakang, misalnya "CS 1" dan "CS 2" menjadi "CS". */
function groupCounters(counters: AdminCounter[]): { label: string; counters: AdminCounter[] }[] {
  const groups = new Map<string, { label: string; counters: AdminCounter[] }>();
  for (const counter of counters) {
    const base = counter.name.trim().replace(/\s*\d+$/, "") || counter.name.trim();
    const key = base.toLowerCase();
    const group = groups.get(key) ?? { label: base, counters: [] };
    group.counters.push(counter);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function ServiceFields({ defaults }: { defaults: ServiceBody }) {
  return (
    <>
      <Field label="Nama layanan">
        <input name="name" required maxLength={80} defaultValue={defaults.name} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Huruf awalan" hint="1–2 huruf">
          <input
            name="prefix"
            required
            maxLength={2}
            pattern="[A-Za-z]{1,2}"
            defaultValue={defaults.prefix}
            className={cn(inputClass, "uppercase")}
          />
        </Field>
        <Field label="Urutan" hint="Urutan tombol di kiosk">
          <input name="sortOrder" type="number" min={0} max={999} required defaultValue={defaults.sortOrder} className={inputClass} />
        </Field>
      </div>
      <Switch name="isActive" label="Tampil di kiosk" description="Matikan untuk menyembunyikan tanpa menghapus laporan lama." defaultChecked={defaults.isActive} />
    </>
  );
}

/** Huruf pertama A–Z yang belum dipakai layanan mana pun. */
function suggestPrefix(services: AdminService[]): string {
  const used = new Set(services.map((service) => service.prefix.toUpperCase()));
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return letter;
  }
  return "";
}
