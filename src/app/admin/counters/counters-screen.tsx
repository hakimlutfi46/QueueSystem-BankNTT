"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { submitAdmin } from "@/app/admin/submit";
import { useLiveRefresh } from "@/app/admin/use-live-refresh";
import { BrandButton } from "@/components/brand/brand-button";
import { Badge, CounterStatusBadge, PrefixTile } from "@/components/ui/badge";
import { ChipCheckbox, Field, inputClass } from "@/components/ui/field";
import { useConfirm } from "@/components/ui/confirm";
import { Icon } from "@/components/ui/icon";
import { Alert, EmptyState, Modal, PageHeader, Panel } from "@/components/ui/panel";
import { counterBaseName, nextCounterNumber, planCounters, splitCounterName } from "@/lib/admin/counter-names";
import type { AdminCounter } from "@/lib/admin/counters";
import type { AdminService } from "@/lib/admin/services";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format-duration";
import { useQueueState } from "@/lib/realtime/use-queue-state";
import type { QueueCounterState } from "@/lib/realtime/types";
import { secondsSince, useNow } from "@/lib/use-now";

type StatusFilter = "all" | "OPEN" | "PAUSED" | "CLOSED" | "inactive";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "OPEN", label: "Buka" },
  { value: "PAUSED", label: "Istirahat" },
  { value: "CLOSED", label: "Tutup" },
  { value: "inactive", label: "Nonaktif" },
];

export function CountersScreen({
  counters,
  services,
}: {
  counters: AdminCounter[];
  services: AdminService[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { state } = useQueueState();
  useLiveRefresh(["COUNTER_CHANGED", "CONFIG_CHANGED"]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminCounter | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [closing, setClosing] = useState<{ counter: AdminCounter; ticket: string | null; officer: string | null } | null>(null);
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showInactive, setShowInactive] = useState(false);

  const activeServices = services.filter((service) => service.isActive);
  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const liveById = useMemo(
    () => new Map((state?.counters ?? []).map((counter) => [counter.id, counter])),
    [state],
  );

  const rows = counters.map((counter) => {
    const live = liveById.get(counter.id);
    return { counter, live, status: live?.status ?? counter.status };
  });
  const tally = {
    active: rows.filter((row) => row.counter.isActive).length,
    open: rows.filter((row) => row.counter.isActive && row.status === "OPEN").length,
    paused: rows.filter((row) => row.counter.isActive && row.status === "PAUSED").length,
    inactive: rows.filter((row) => !row.counter.isActive).length,
  };

  const needle = query.trim().toLowerCase();
  const filtered = rows.filter(({ counter, status }) => {
    if (needle && !counter.name.toLowerCase().includes(needle)) return false;
    if (serviceFilter !== "all" && !counter.serviceIds.includes(serviceFilter)) return false;
    if (statusFilter === "inactive") return !counter.isActive;
    if (statusFilter !== "all") return counter.isActive && status === statusFilter;
    return true;
  });
  const visible = filtered.filter((row) => row.counter.isActive || statusFilter === "inactive");
  const hiddenInactive = statusFilter === "inactive" ? [] : filtered.filter((row) => !row.counter.isActive);

  function done(message: string | null, success: string) {
    setError(message);
    setNotice(message ? null : success);
    if (!message) router.refresh();
    return message;
  }

  async function toggle(counter: AdminCounter) {
    const ok = await confirm(
      counter.isActive
        ? {
            title: `Nonaktifkan ${counter.name}?`,
            message: "Loket ini hilang dari layar pilih loket petugas dan dari TV. Riwayat dan laporannya tetap tersimpan, dan loket bisa diaktifkan lagi kapan saja.",
            confirmLabel: "Nonaktifkan",
          }
        : {
            title: `Aktifkan ${counter.name}?`,
            message: "Loket ini muncul lagi di layar pilih loket petugas dan di TV.",
            confirmLabel: "Aktifkan",
            tone: "primary",
          },
    );
    if (!ok) return;
    const message = await submitAdmin(`/api/admin/counters/${counter.id}`, "PATCH", {
      isActive: !counter.isActive,
    });
    done(message, counter.isActive ? `${counter.name} dinonaktifkan.` : `${counter.name} aktif kembali.`);
  }

  return (
    <section>
      <PageHeader
        title="Loket"
        description="Atur jumlah loket cabang ini. Loket baru langsung muncul di layar petugas dan TV tanpa muat ulang."
        actions={
          <BrandButton variant="outline" onClick={() => setBulkOpen(true)} disabled={activeServices.length === 0}>
            <Icon name="layers" />
            Tambah beberapa loket
          </BrandButton>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tally label="Loket aktif" value={tally.active} />
        <Tally label="Sedang buka" value={tally.open} tone="success" />
        <Tally label="Istirahat" value={tally.paused} tone="orange" />
        <Tally label="Nonaktif" value={tally.inactive} tone="muted" />
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-3 rounded-[var(--radius-card)] border border-line bg-brand-white p-3 shadow-card">
            <label className="relative min-w-48 flex-1">
              <span className="sr-only">Cari loket</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama loket"
                className={cn(inputClass, "min-h-10 pl-9")}
              />
            </label>
            <label>
              <span className="sr-only">Saring layanan</span>
              <select
                value={serviceFilter}
                onChange={(event) =>
                  setServiceFilter(event.target.value === "all" ? "all" : Number(event.target.value))
                }
                className={cn(inputClass, "min-h-10 sm:w-52")}
              >
                <option value="all">Semua layanan</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.prefix} · {service.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1" role="group" aria-label="Saring status">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={statusFilter === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold",
                    statusFilter === filter.value ? "bg-brand-white text-brand-navy shadow-card" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 && hiddenInactive.length === 0 ? (
            <EmptyState
              icon="desk"
              title={counters.length === 0 ? "Belum ada loket" : "Tidak ada loket yang cocok"}
              description={
                counters.length === 0
                  ? "Tambahkan loket pertama dari panel di samping."
                  : "Ubah kata kunci atau saringan untuk melihat loket lain."
              }
            />
          ) : (
            <CounterGrid
              rows={visible}
              serviceById={serviceById}
              targetMinutes={state?.settings.targetServiceMinutes ?? 10}
              onEdit={setEditing}
              onToggle={(counter) => void toggle(counter)}
              onForceClose={(counter, ticket, officer) => setClosing({ counter, ticket, officer })}
            />
          )}

          {hiddenInactive.length > 0 ? (
            <div className="mt-6">
              <button
                type="button"
                aria-expanded={showInactive}
                onClick={() => setShowInactive((value) => !value)}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-left font-bold text-ink-muted hover:bg-brand-white"
              >
                <Icon name="power" className="size-4" />
                <span className="flex-1">{hiddenInactive.length} loket nonaktif</span>
                <span className="text-sm text-brand-blue">{showInactive ? "Sembunyikan" : "Tampilkan"}</span>
              </button>
              {showInactive ? (
                <div className="mt-4">
                  <CounterGrid
                    rows={hiddenInactive}
                    serviceById={serviceById}
                    targetMinutes={state?.settings.targetServiceMinutes ?? 10}
                    onEdit={setEditing}
                    onToggle={(counter) => void toggle(counter)}
                    onForceClose={(counter, ticket, officer) => setClosing({ counter, ticket, officer })}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <CreateCounterPanel
            counters={counters}
            services={activeServices}
            onSaved={(message, name) => done(message, `${name} ditambahkan.`)}
          />
        </div>
      </div>

      {editing ? (
        <EditCounterModal
          counter={editing}
          services={services}
          onClose={() => setEditing(null)}
          onSaved={async (body) => {
            const message = await submitAdmin(`/api/admin/counters/${editing.id}`, "PATCH", body);
            if (!done(message, `${body.name} disimpan.`)) setEditing(null);
          }}
        />
      ) : null}

      {closing ? (
        <Modal
          title={`Tutup paksa ${closing.counter.name}?`}
          description="Gunakan bila petugas meninggalkan loket tanpa menutupnya."
          onClose={() => setClosing(null)}
        >
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex gap-2">
                <Icon name="user" className="mt-0.5 size-4 text-ink-muted" />
                {closing.officer ? `${closing.officer} dikeluarkan dari loket ini.` : "Loket dilepas dari petugasnya."}
              </li>
              <li className="flex gap-2">
                <Icon name="ticket" className="mt-0.5 size-4 text-ink-muted" />
                {closing.ticket
                  ? `Nomor ${closing.ticket} yang sedang dilayani ditandai selesai otomatis dan tidak dihitung dalam rata-rata.`
                  : "Tidak ada nomor yang sedang dilayani."}
              </li>
              <li className="flex gap-2">
                <Icon name="tv" className="mt-0.5 size-4 text-ink-muted" />
                Loket hilang dari TV sampai dibuka lagi.
              </li>
            </ul>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <BrandButton variant="ghost" onClick={() => setClosing(null)}>
                Batal
              </BrandButton>
              <BrandButton
                variant="danger"
                onClick={async () => {
                  const target = closing.counter;
                  const message = await submitAdmin(`/api/admin/counters/${target.id}/close`, "POST", {});
                  if (!done(message, `${target.name} ditutup.`)) setClosing(null);
                }}
              >
                <Icon name="lock" className="size-4" />
                Tutup paksa
              </BrandButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {bulkOpen ? (
        <BulkCounterModal
          counters={counters}
          services={activeServices}
          onClose={() => setBulkOpen(false)}
          onSaved={async (items) => {
            const message = await submitAdmin("/api/admin/counters", "POST", { items });
            if (!done(message, `${items.length} loket ditambahkan.`)) setBulkOpen(false);
            return message;
          }}
        />
      ) : null}
      {dialog}
    </section>
  );
}

function CounterGrid({
  rows,
  serviceById,
  targetMinutes,
  onEdit,
  onToggle,
  onForceClose,
}: {
  rows: { counter: AdminCounter; live: QueueCounterState | undefined; status: string }[];
  serviceById: Map<number, AdminService>;
  targetMinutes: number;
  onEdit: (counter: AdminCounter) => void;
  onToggle: (counter: AdminCounter) => void;
  onForceClose: (counter: AdminCounter, ticket: string | null, officer: string | null) => void;
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {rows.map(({ counter, live, status }) => (
        <li key={counter.id}>
          <CounterCard
            counter={counter}
            live={live}
            status={status}
            services={counter.serviceIds.flatMap((id) => serviceById.get(id) ?? [])}
            targetMinutes={targetMinutes}
            onEdit={() => onEdit(counter)}
            onToggle={() => onToggle(counter)}
            onForceClose={() =>
              onForceClose(counter, live?.activeTicket?.number ?? null, live?.officerName ?? counter.officerName)
            }
          />
        </li>
      ))}
    </ul>
  );
}

function Tally({
  label,
  value,
  tone = "navy",
}: {
  label: string;
  value: number;
  tone?: "navy" | "success" | "orange" | "muted";
}) {
  const dot = {
    navy: "bg-brand-navy",
    success: "bg-success",
    orange: "bg-brand-orange",
    muted: "bg-brand-grey",
  }[tone];
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-brand-white px-4 py-3 shadow-card">
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-brand-navy tabular-nums">{value}</p>
    </div>
  );
}

function CounterCard({
  counter,
  live,
  status,
  services,
  targetMinutes,
  onEdit,
  onToggle,
  onForceClose,
}: {
  counter: AdminCounter;
  live: QueueCounterState | undefined;
  status: string;
  services: AdminService[];
  targetMinutes: number;
  onEdit: () => void;
  onToggle: () => void;
  onForceClose: () => void;
}) {
  const busy = counter.isActive && (status === "OPEN" || status === "PAUSED");
  const officer = live?.officerName ?? counter.officerName;
  const ticket = live?.activeTicket ?? null;

  return (
    <article
      data-testid={`admin-counter-${counter.id}`}
      className={cn(
        "flex h-full flex-col rounded-[var(--radius-card)] border bg-brand-white p-4 shadow-card transition-shadow",
        counter.isActive ? "border-line" : "border-dashed border-line opacity-70",
        status === "OPEN" && counter.isActive ? "hover:shadow-glow" : null,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-14 shrink-0 flex-col items-center justify-center rounded-xl font-bold leading-none",
            counter.isActive ? "bg-brand-navy text-brand-white" : "bg-surface text-ink-muted",
          )}
          aria-hidden="true"
        >
          <span className="text-[10px] uppercase tracking-wider opacity-80">Loket</span>
          <span className="text-2xl tabular-nums">{counter.displayNumber}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-brand-navy">{counter.name}</h3>
          <div className="mt-1">
            <CounterStatusBadge status={status} inactive={!counter.isActive} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {services.length === 0 ? (
          <Badge tone="danger">Belum ada layanan</Badge>
        ) : (
          services.map((service) => (
            <Badge key={service.id} tone="sky">
              {service.prefix} · {service.name}
            </Badge>
          ))
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface p-3 text-sm">
        <div>
          <dt className="text-ink-muted">Petugas</dt>
          <dd className="truncate font-bold">{busy ? (officer ?? "—") : "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Sedang dilayani</dt>
          <dd className="font-bold tabular-nums">
            {ticket ? (
              <span className="flex items-center gap-2">
                {ticket.number}
                <LiveDuration calledAt={ticket.calledAt} targetMinutes={targetMinutes} />
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <BrandButton size="sm" variant="outline" onClick={onEdit} ariaLabel={`Ubah ${counter.name}`}>
          <Icon name="edit" className="size-4" />
          Ubah
        </BrandButton>
        {busy ? (
          <BrandButton size="sm" variant="danger" onClick={onForceClose} ariaLabel={`Tutup paksa ${counter.name}`}>
            <Icon name="lock" className="size-4" />
            Tutup paksa
          </BrandButton>
        ) : (
          <BrandButton
            size="sm"
            variant={counter.isActive ? "danger" : "outline"}
            onClick={onToggle}
            ariaLabel={`${counter.isActive ? "Nonaktifkan" : "Aktifkan"} ${counter.name}`}
          >
            <Icon name="power" className="size-4" />
            {counter.isActive ? "Nonaktifkan" : "Aktifkan"}
          </BrandButton>
        )}
      </div>
    </article>
  );
}

function LiveDuration({ calledAt, targetMinutes }: { calledAt: string | null; targetMinutes: number }) {
  const seconds = secondsSince(calledAt, useNow());
  if (seconds == null) return null;
  const late = seconds > targetMinutes * 60;
  return (
    <span className={cn("text-xs font-normal", late ? "font-bold text-brand-orange" : "text-ink-muted")}>
      sejak {formatDuration(seconds)}
    </span>
  );
}

/** Nama dan nomor tampil disarankan dari layanan pertama yang dipilih, sampai admin mengetiknya sendiri. */
function CreateCounterPanel({
  counters,
  services,
  onSaved,
}: {
  counters: AdminCounter[];
  services: AdminService[];
  onSaved: (message: string | null, name: string) => string | null;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [numberTouched, setNumberTouched] = useState(false);
  const [pending, setPending] = useState(false);

  const firstService = services.find((service) => service.id === selected[0]);
  const base = firstService ? counterBaseName(firstService.name) : "";
  const suggestedNumber = base ? nextCounterNumber(counters, base) : null;
  const shownName = nameTouched ? name : base && suggestedNumber ? `${base} ${suggestedNumber}` : "";
  const parsedName = splitCounterName(shownName);
  const shownNumber = numberTouched
    ? displayNumber
    : parsedName
      ? String(parsedName.number)
      : suggestedNumber
        ? String(suggestedNumber)
        : "";
  const duplicate = counters.some(
    (counter) => counter.isActive && counter.name.trim().toLowerCase() === shownName.trim().toLowerCase(),
  );

  function reset() {
    setSelected([]);
    setName("");
    setDisplayNumber("");
    setNameTouched(false);
    setNumberTouched(false);
  }

  async function save(formData: FormData) {
    setPending(true);
    const body = {
      name: String(formData.get("name") ?? ""),
      displayNumber: Number(formData.get("displayNumber") ?? 0),
      serviceIds: formData.getAll("serviceId").map((value) => Number(value)),
    };
    const message = await submitAdmin("/api/admin/counters", "POST", body);
    setPending(false);
    if (!onSaved(message, body.name)) reset();
  }

  return (
    <Panel title="Tambah loket" description="Pilih layanan dulu, nama dan nomor akan disarankan.">
      <form action={save} className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Layanan yang dilayani</legend>
          {services.length === 0 ? (
            <p className="text-sm text-ink-muted">Aktifkan minimal satu layanan di menu Layanan.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map((service) => (
                <ChipCheckbox
                  key={service.id}
                  name="serviceId"
                  value={service.id}
                  label={service.name}
                  checked={selected.includes(service.id)}
                  onChange={(checked) =>
                    setSelected((current) =>
                      checked ? [...current, service.id] : current.filter((id) => id !== service.id),
                    )
                  }
                  leading={<PrefixTile prefix={service.prefix} className="size-6 rounded-md text-xs" />}
                />
              ))}
            </div>
          )}
        </fieldset>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <Field
            label="Nama loket"
            hint={duplicate ? <span className="font-bold text-danger">Nama ini sudah dipakai loket aktif.</span> : "Contoh: CS 3, Teller 4"}
          >
            <input
              name="name"
              required
              maxLength={80}
              value={shownName}
              onChange={(event) => {
                setNameTouched(true);
                setName(event.target.value);
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Nomor tampil" hint="Dibacakan di TV">
            <input
              name="displayNumber"
              type="number"
              min={1}
              max={999}
              required
              value={shownNumber}
              onChange={(event) => {
                setNumberTouched(true);
                setDisplayNumber(event.target.value);
              }}
              className={inputClass}
            />
          </Field>
        </div>
        <BrandButton type="submit" disabled={pending || selected.length === 0 || duplicate}>
          <Icon name="plus" />
          Simpan loket
        </BrandButton>
      </form>
    </Panel>
  );
}

function EditCounterModal({
  counter,
  services,
  onClose,
  onSaved,
}: {
  counter: AdminCounter;
  services: AdminService[];
  onClose: () => void;
  onSaved: (body: { name: string; displayNumber: number; serviceIds: number[] }) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Modal title={`Ubah ${counter.name}`} description="Perubahan langsung terlihat di TV dan layar petugas." onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        action={async (formData) => {
          setPending(true);
          await onSaved({
            name: String(formData.get("name") ?? ""),
            displayNumber: Number(formData.get("displayNumber") ?? 0),
            serviceIds: formData.getAll("serviceId").map((value) => Number(value)),
          });
          setPending(false);
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <Field label="Nama">
            <input name="name" required maxLength={80} defaultValue={counter.name} className={inputClass} />
          </Field>
          <Field label="Nomor tampil">
            <input
              name="displayNumber"
              type="number"
              min={1}
              max={999}
              required
              defaultValue={counter.displayNumber}
              className={inputClass}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Layanan yang dilayani</legend>
          <div className="flex flex-wrap gap-2">
            {services.filter((service) => service.isActive || counter.serviceIds.includes(service.id)).map((service) => (
              <ChipCheckbox
                key={service.id}
                name="serviceId"
                value={service.id}
                label={service.isActive ? service.name : `${service.name} (nonaktif)`}
                defaultChecked={counter.serviceIds.includes(service.id)}
                leading={<PrefixTile prefix={service.prefix} className="size-6 rounded-md text-xs" />}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Loket yang melayani beberapa layanan memanggil tiket paling awal di antara layanannya.
          </p>
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <BrandButton variant="ghost" onClick={onClose}>
            Batal
          </BrandButton>
          <BrandButton type="submit" disabled={pending}>
            Simpan perubahan
          </BrandButton>
        </div>
      </form>
    </Modal>
  );
}

function BulkCounterModal({
  counters,
  services,
  onClose,
  onSaved,
}: {
  counters: AdminCounter[];
  services: AdminService[];
  onClose: () => void;
  onSaved: (items: { name: string; displayNumber: number; serviceIds: number[] }[]) => Promise<string | null>;
}) {
  const [serviceIds, setServiceIds] = useState<number[]>(services[0] ? [services[0].id] : []);
  const [baseInput, setBaseInput] = useState<string | null>(null);
  const [startInput, setStartInput] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(2);
  const [pending, setPending] = useState(false);

  const firstService = services.find((service) => service.id === serviceIds[0]);
  const base = baseInput ?? (firstService ? counterBaseName(firstService.name) : "Loket");
  const start = startInput ?? String(nextCounterNumber(counters, base));
  const plan = planCounters(counters, base, Number(start) || 1, quantity);
  const blocked = plan.some((item) => item.taken) || serviceIds.length === 0 || plan.length === 0 || !base.trim();

  return (
    <Modal
      wide
      title="Tambah beberapa loket"
      description="Cocok untuk menyiapkan cabang baru atau menambah loket di jam sibuk."
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Layanan</legend>
          <div className="flex flex-wrap gap-2">
            {services.map((service) => (
              <ChipCheckbox
                key={service.id}
                value={service.id}
                label={service.name}
                checked={serviceIds.includes(service.id)}
                onChange={(checked) => {
                  setBaseInput(null);
                  setStartInput(null);
                  setServiceIds((current) =>
                    checked ? [...current, service.id] : current.filter((id) => id !== service.id),
                  );
                }}
                leading={<PrefixTile prefix={service.prefix} className="size-6 rounded-md text-xs" />}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nama dasar">
            <input
              value={base}
              maxLength={60}
              onChange={(event) => {
                setBaseInput(event.target.value);
                setStartInput(null);
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Mulai dari nomor">
            <input
              type="number"
              min={1}
              max={999}
              value={start}
              onChange={(event) => setStartInput(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Jumlah loket" hint="Maksimal 20 sekaligus">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line text-xl font-bold hover:bg-surface"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                aria-label="Kurangi jumlah"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
                className={cn(inputClass, "text-center")}
              />
              <button
                type="button"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line text-xl font-bold hover:bg-surface"
                onClick={() => setQuantity((value) => Math.min(20, value + 1))}
                aria-label="Tambah jumlah"
              >
                +
              </button>
            </div>
          </Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold">Pratinjau</p>
          <ul className="flex flex-wrap gap-2">
            {plan.map((item) => (
              <li
                key={item.name}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-bold",
                  item.taken ? "border-danger bg-danger-soft text-danger" : "border-line bg-navy-soft text-brand-navy",
                )}
              >
                {item.name}
                {item.taken ? " · sudah ada" : ""}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <BrandButton variant="ghost" onClick={onClose}>
            Batal
          </BrandButton>
          <BrandButton
            disabled={pending || blocked}
            onClick={async () => {
              setPending(true);
              await onSaved(plan.map((item) => ({ name: item.name, displayNumber: item.displayNumber, serviceIds })));
              setPending(false);
            }}
          >
            <Icon name="plus" />
            {`Tambah ${plan.length} loket`}
          </BrandButton>
        </div>
      </div>
    </Modal>
  );
}
