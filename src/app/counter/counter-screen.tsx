"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/ui/logout-button";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandHeader } from "@/components/brand/brand-header";
import { QueueNumber } from "@/components/brand/queue-number";
import { Badge, CounterStatusBadge, PrefixTile } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { mergeCounterDesk } from "@/lib/counters/merge";
import type { CounterDesk } from "@/lib/counters/types";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format-duration";
import type { QueueState } from "@/lib/realtime/types";
import { useQueueState } from "@/lib/realtime/use-queue-state";
import { secondsSince, useNow } from "@/lib/use-now";

type DeskView = Extract<CounterDesk, { mode: "desk" }>;
type Confirm = "close" | "no-show" | null;

export function CounterScreen({
  officerId,
  officerName,
  initial,
}: {
  officerId: number;
  officerName: string;
  initial: CounterDesk;
}) {
  const live = useQueueState();
  const [desk, setDesk] = useState(initial);
  const [syncedAsOf, setSyncedAsOf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const lockedUntil = useRef(0);
  const view = mergeCounterDesk(desk, live.state, officerId, syncedAsOf);

  const liveAsOf = live.state?.asOf ?? null;
  const reload = useCallback(async (counterId: number, name: string) => {
    if (Date.now() < lockedUntil.current) return;
    lockedUntil.current = Date.now() + 1500;
    setLocked(true);
    setError(null);
    setConfirm(null);
    try {
      const response = await fetch(`/api/counters/${counterId}/${name}`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setError(body?.error?.message ?? "Permintaan gagal.");
        return;
      }
      const next = await fetch("/api/counters/mine", { cache: "no-store" });
      if (!next.ok) {
        setError("Loket gagal dimuat ulang.");
        return;
      }
      setDesk((await next.json()) as CounterDesk);
      setSyncedAsOf(liveAsOf);
    } catch {
      setError("Mohon hubungi petugas.");
    } finally {
      const wait = Math.max(lockedUntil.current - Date.now(), 0);
      window.setTimeout(() => setLocked(false), wait);
    }
  }, [liveAsOf]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (confirm || view.mode !== "desk") return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        void reload(view.counter.id, view.counter.status === "PAUSED" ? "open" : "next");
      } else if ((event.key === "r" || event.key === "R") && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        void reload(view.counter.id, "recall");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, reload, view]);

  return (
    <main className="min-h-screen bg-surface">
      <BrandHeader
        branchName={view.branchName}
        trailing={
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "hidden items-center gap-2 rounded-full bg-brand-blue px-3 py-1.5 text-xs font-bold sm:inline-flex",
              )}
              title={live.connected ? "Tersambung" : "Menyambung ulang"}
            >
              <span
                className={cn("size-2 rounded-full", live.connected ? "animate-live-dot bg-brand-white text-brand-white" : "bg-brand-orange")}
                aria-hidden="true"
              />
              {live.connected ? "Langsung" : "Menyambung…"}
            </span>
            <a
              href="/account/password?next=%2Fcounter"
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold hover:bg-brand-white/10"
              title="Ganti kata sandi"
            >
              <Icon name="user" className="size-4" />
              {officerName}
              <Icon name="lock" className="size-3.5 opacity-70" />
            </a>
            <LogoutButton
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-card)] border border-line bg-brand-white px-3 text-sm font-bold text-brand-navy hover:border-brand-blue hover:bg-navy-soft"
              warning={
                view.mode === "desk" ? (
                  <>
                    <strong>{view.counter.name}</strong> masih{" "}
                    {view.counter.status === "PAUSED" ? "istirahat" : "buka"} atas nama Anda dan tetap tampil di TV.
                    {view.activeTicket ? ` Nomor ${view.activeTicket.number} masih dilayani.` : ""} Tutup loket dulu bila
                    Anda selesai bertugas.
                  </>
                ) : undefined
              }
            >
              <Icon name="logout" className="size-4" />
              Keluar
            </LogoutButton>
          </div>
        }
      />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        {error ? (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 font-bold text-danger">
            <Icon name="close" className="size-4" />
            {error}
          </p>
        ) : null}
        {view.mode === "pick" ? (
          <Picker
            counters={view.counters}
            locked={locked}
            onOpen={(id) => void reload(id, "open")}
          />
        ) : (
          <Desk
            view={view}
            live={live.state}
            locked={locked}
            confirm={confirm}
            onConfirm={setConfirm}
            onAction={(name) => void reload(view.counter.id, name)}
          />
        )}
      </section>
    </main>
  );
}

function Picker({
  counters,
  locked,
  onOpen,
}: {
  counters: Extract<CounterDesk, { mode: "pick" }>["counters"];
  locked: boolean;
  onOpen: (id: number) => void;
}) {
  const sorted = [...counters].sort((left, right) => Number(right.available) - Number(left.available));
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Pilih loket</h1>
        <p className="mt-1 text-ink-muted">Pilih meja tempat Anda bertugas hari ini. Loket yang dipakai petugas lain tidak bisa dibuka.</p>
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line bg-brand-white p-8 text-center text-ink-muted">
          Belum ada loket aktif. Minta admin menambahkan loket.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((counter) => (
            <li key={counter.id}>
              <article
                className={cn(
                  "flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-brand-white p-5 shadow-card transition-shadow",
                  counter.available ? "hover:shadow-glow" : "opacity-75",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-14 shrink-0 items-center justify-center rounded-xl text-2xl font-bold tabular-nums",
                      counter.available ? "bg-brand-navy text-brand-white" : "bg-surface text-ink-muted",
                    )}
                    aria-hidden="true"
                  >
                    {counter.displayNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-bold text-brand-navy">{counter.name}</p>
                    <CounterStatusBadge status={counter.status} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {counter.serviceNames.length ? (
                    counter.serviceNames.map((name) => (
                      <Badge key={name} tone="sky">{name}</Badge>
                    ))
                  ) : (
                    <Badge tone="muted">Tanpa layanan</Badge>
                  )}
                </div>
                <div className="mt-auto pt-4">
                  {counter.available ? (
                    <BrandButton className="w-full" disabled={locked} onClick={() => onOpen(counter.id)}>
                      {`Buka ${counter.name}`}
                    </BrandButton>
                  ) : (
                    <p className="flex items-center gap-2 rounded-xl bg-surface px-3 py-3 text-sm font-bold text-ink-muted">
                      <Icon name="lock" className="size-4" />
                      Dipakai {counter.officerName ?? "petugas lain"}
                    </p>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Desk({
  view,
  live,
  locked,
  confirm,
  onConfirm,
  onAction,
}: {
  view: DeskView;
  live: QueueState | null;
  locked: boolean;
  confirm: Confirm;
  onConfirm: (value: Confirm) => void;
  onAction: (name: string) => void;
}) {
  const paused = view.counter.status === "PAUSED";
  const hasActive = view.activeTicket != null;
  const canCall = hasActive || view.waitingCount > 0;
  const maxRecall = live?.settings.maxRecall ?? 3;
  const recalls = view.activeTicket ? Math.max(0, view.activeTicket.callCount - 1) : 0;
  const recallLeft = Math.max(0, maxRecall - recalls);
  const mainLabel = paused
    ? "Lanjutkan layanan"
    : hasActive
      ? "Selesai dan panggil berikutnya"
      : "Panggil berikutnya";
  const myServices = live
    ? live.services.filter((service) =>
        live.counters.find((counter) => counter.id === view.counter.id)?.serviceIds.includes(service.id),
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-xl bg-brand-navy text-xl font-bold text-brand-white tabular-nums" aria-hidden="true">
          {view.counter.displayNumber}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-brand-navy sm:text-2xl">{view.counter.name}</h1>
          <p className="text-sm text-ink-muted">{view.counter.serviceNames.join(", ") || "Tanpa layanan"}</p>
        </div>
        <CounterStatusBadge status={view.counter.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section
          className={cn(
            "relative overflow-hidden rounded-[var(--radius-card)] border bg-brand-white p-6 text-center shadow-card",
            hasActive ? "border-brand-sky shadow-glow" : "border-line",
          )}
          aria-live="polite"
        >
          <p className="text-sm font-bold uppercase tracking-wider text-ink-muted">
            {hasActive ? "Sedang dilayani" : paused ? "Loket istirahat" : "Nomor berikutnya"}
          </p>
          {view.activeTicket ? (
            <>
              <div data-testid="active-number" className="animate-pop-in mt-2" key={view.activeTicket.id}>
                <QueueNumber value={view.activeTicket.number} size="counter" className="sm:text-[128px]" />
              </div>
              <p className="mt-1 text-lg font-bold text-brand-navy">{view.activeTicket.serviceName}</p>
              <ServiceTimer calledAt={view.activeTicket.calledAt} targetMinutes={view.targetServiceMinutes} />
              <p className="mt-3 text-sm text-ink-muted">
                Dipanggil {view.activeTicket.callCount}× ·{" "}
                {recallLeft > 0 ? `${recallLeft} panggil ulang tersisa` : "batas panggil ulang tercapai"}
              </p>
            </>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3">
              <span className="flex size-16 items-center justify-center rounded-full bg-navy-soft text-brand-navy">
                <Icon name={paused ? "pause" : view.waitingCount === 0 ? "clock" : "megaphone"} className="size-8" />
              </span>
              <p className="text-2xl font-bold text-brand-navy">
                {paused ? "Istirahat" : view.waitingCount === 0 ? "Belum ada antrian" : "Siap memanggil"}
              </p>
              <p className="max-w-xs text-sm text-ink-muted">
                {paused
                  ? "Nasabah tidak akan diarahkan ke loket ini sampai Anda melanjutkan."
                  : view.waitingCount === 0
                    ? "Tombol panggil aktif sendiri begitu ada tiket baru."
                    : `${view.waitingCount} nasabah menunggu. Tekan Spasi untuk memanggil.`}
              </p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          {confirm ? (
            <div role="dialog" aria-label="Konfirmasi" className="animate-fade-up rounded-[var(--radius-card)] border-2 border-brand-orange bg-brand-white p-5 shadow-card">
              <p className="flex items-center gap-2 text-lg font-bold">
                <Icon name={confirm === "close" ? "power" : "userX"} />
                {confirm === "close" ? "Tutup loket ini?" : "Tandai nomor ini tidak hadir?"}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {confirm === "close"
                  ? "Loket hilang dari TV sampai dibuka lagi."
                  : "Tiket hangus dan tidak kembali ke antrian. Nomor berikutnya langsung dipanggil."}
              </p>
              <div className="mt-4 flex gap-3">
                <BrandButton disabled={locked} onClick={() => onAction(confirm === "close" ? "close" : "no-show")}>
                  Ya
                </BrandButton>
                <BrandButton variant="outline" onClick={() => onConfirm(null)}>
                  Batal
                </BrandButton>
              </div>
            </div>
          ) : (
            <>
              <BrandButton
                size="lg"
                className="min-h-24 w-full text-2xl"
                disabled={locked || (!paused && !canCall)}
                onClick={() => onAction(paused ? "open" : "next")}
              >
                <Icon name={paused ? "play" : "megaphone"} className="size-7" />
                {mainLabel}
              </BrandButton>
              {paused ? null : (
                <div className="grid grid-cols-2 gap-3">
                  <ActionButton
                    icon="repeat"
                    disabled={locked || !hasActive || recallLeft === 0}
                    onClick={() => onAction("recall")}
                    hint="R"
                  >
                    Panggil ulang
                  </ActionButton>
                  <ActionButton icon="userX" disabled={locked || !hasActive} onClick={() => onConfirm("no-show")}>
                    Tidak hadir
                  </ActionButton>
                  <ActionButton icon="check" disabled={locked || !hasActive} onClick={() => onAction("finish")}>
                    Selesai tanpa memanggil
                  </ActionButton>
                  <ActionButton icon="pause" disabled={locked || hasActive} onClick={() => onAction("pause")}>
                    Istirahat
                  </ActionButton>
                </div>
              )}
              <BrandButton variant="danger" disabled={locked || hasActive} onClick={() => onConfirm("close")}>
                <Icon name="power" className="size-4" />
                Tutup loket
              </BrandButton>
              <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                Pintasan:
                <kbd className="rounded-md border border-line bg-brand-white px-1.5 py-0.5 font-bold">Spasi</kbd>
                tombol utama
                <kbd className="rounded-md border border-line bg-brand-white px-1.5 py-0.5 font-bold">R</kbd>
                panggil ulang
              </p>
            </>
          )}

          <div className="rounded-[var(--radius-card)] border border-line bg-brand-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-bold text-brand-navy">Menunggu untuk loket ini</p>
              <p className="text-3xl font-bold text-brand-navy tabular-nums">
                <span className="sr-only">Menunggu: </span>
                {view.waitingCount}
              </p>
            </div>
            {myServices.length > 1 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {myServices.map((service) => (
                  <li key={service.id} className="flex items-center gap-2 text-sm">
                    <PrefixTile prefix={service.prefix} className="size-7 rounded-lg text-xs" />
                    <span className="flex-1">{service.name}</span>
                    <span className="font-bold tabular-nums">{service.waitingCount}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-[var(--radius-card)] border border-line bg-brand-white shadow-card">
        <h2 className="border-b border-line px-5 py-4 text-lg font-bold text-brand-navy">10 nomor terakhir</h2>
        {view.recent.length === 0 ? (
          <p className="px-5 py-6 text-ink-muted">Belum ada layanan hari ini.</p>
        ) : (
          <ul className="divide-y divide-line">
            {view.recent.map((ticket) => {
              const late = ticket.handlingSeconds != null && ticket.handlingSeconds > view.targetServiceMinutes * 60;
              return (
                <li key={ticket.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-16 font-bold text-brand-navy tabular-nums">{ticket.number}</span>
                  <span className="flex-1 truncate text-sm">{ticket.serviceName}</span>
                  {ticket.status === "NO_SHOW" ? <Badge tone="danger">Tidak hadir</Badge> : <Badge tone="success">Selesai</Badge>}
                  <span className={cn("w-16 text-right tabular-nums", late ? "font-bold text-brand-orange" : null)}>
                    {ticket.handlingSeconds == null ? "—" : formatDuration(ticket.handlingSeconds)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActionButton({
  icon,
  children,
  disabled,
  onClick,
  hint,
}: {
  icon: IconName;
  children: string;
  disabled: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-line bg-brand-white px-3 py-3 text-sm font-bold text-brand-navy shadow-card transition-colors hover:border-brand-blue hover:bg-navy-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
    >
      <Icon name={icon} className="size-6" />
      {children}
      {hint ? (
        <kbd className="absolute right-2 top-2 rounded border border-line px-1 text-[10px] text-ink-muted" aria-hidden="true">
          {hint}
        </kbd>
      ) : null}
    </button>
  );
}

function ServiceTimer({
  calledAt,
  targetMinutes,
}: {
  calledAt: string | null;
  targetMinutes: number;
}) {
  const seconds = secondsSince(calledAt, useNow());
  if (seconds == null) return <p className="mt-4 text-3xl font-bold tabular-nums">&nbsp;</p>;
  const target = targetMinutes * 60;
  const late = seconds > target;
  const progress = Math.min(1, seconds / Math.max(target, 1));
  return (
    <div className="mx-auto mt-4 w-full max-w-xs">
      <p className={cn("flex items-center justify-center gap-2 text-3xl font-bold tabular-nums", late ? "text-brand-orange" : "text-brand-navy")}>
        <Icon name="clock" className="size-6" />
        {formatDuration(seconds)}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
        <div
          className={cn("h-full rounded-full transition-[width] duration-1000", late ? "bg-brand-orange" : "bg-brand-sky")}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-ink-muted">{late ? "Melewati target" : "Target"} {targetMinutes} menit</p>
    </div>
  );
}
