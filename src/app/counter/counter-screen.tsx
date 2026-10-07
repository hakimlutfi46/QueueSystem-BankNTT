"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { logout } from "@/app/counter/actions";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandHeader } from "@/components/brand/brand-header";
import { QueueNumber } from "@/components/brand/queue-number";
import { mergeCounterDesk } from "@/lib/counters/merge";
import type { CounterDesk } from "@/lib/counters/types";
import { formatDuration } from "@/lib/format-duration";
import { useQueueState } from "@/lib/realtime/use-queue-state";

let clockNow = 0;

function subscribeClock(listener: () => void) {
  clockNow = Date.now();
  const timer = setInterval(() => {
    clockNow = Date.now();
    listener();
  }, 1000);
  return () => clearInterval(timer);
}

function getClock() {
  return clockNow;
}

function getServerClock() {
  return 0;
}

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
  const [confirm, setConfirm] = useState<"close" | "no-show" | null>(null);
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
            <p className="text-sm font-bold">{officerName}</p>
            <form action={logout}>
              <BrandButton type="submit">Keluar</BrandButton>
            </form>
          </div>
        }
      />
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {error ? (
          <p role="alert" className="font-bold text-danger">
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
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-brand-navy">Pilih loket</h1>
      {counters.map((counter) => (
        <div key={counter.id} className="rounded-[var(--radius-card)] bg-brand-white p-4">
          <p className="text-xl font-bold text-brand-navy">{counter.name}</p>
          <p className="text-ink-muted">{counter.serviceNames.join(", ") || "Tanpa layanan"}</p>
          {counter.available ? (
            <BrandButton className="mt-3" disabled={locked} onClick={() => onOpen(counter.id)}>
              {`Buka ${counter.name}`}
            </BrandButton>
          ) : (
            <p className="mt-3 font-bold">Dipakai {counter.officerName ?? "petugas lain"}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Desk({
  view,
  locked,
  confirm,
  onConfirm,
  onAction,
}: {
  view: Extract<CounterDesk, { mode: "desk" }>;
  locked: boolean;
  confirm: "close" | "no-show" | null;
  onConfirm: (value: "close" | "no-show" | null) => void;
  onAction: (name: string) => void;
}) {
  const paused = view.counter.status === "PAUSED";
  const hasActive = view.activeTicket != null;
  const canCall = hasActive || view.waitingCount > 0;
  const mainLabel = paused
    ? "Lanjutkan layanan"
    : hasActive
      ? "Selesai dan panggil berikutnya"
      : "Panggil berikutnya";

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-lg font-bold text-brand-navy">
          {view.counter.name}
          {view.counter.serviceNames.length ? ` · ${view.counter.serviceNames.join(", ")}` : ""}
        </p>
        {paused ? <p className="mt-2 font-bold text-brand-orange">Loket sedang istirahat.</p> : null}
        {view.activeTicket ? (
          <>
            <p className="mt-4 text-ink-muted">{view.activeTicket.serviceName}</p>
            <div data-testid="active-number">
              <QueueNumber value={view.activeTicket.number} size="counter" />
            </div>
            <ServiceTimer
              calledAt={view.activeTicket.calledAt}
              targetMinutes={view.targetServiceMinutes}
            />
          </>
        ) : (
          <p className="mt-6 text-2xl font-bold text-brand-navy">
            {paused ? "Istirahat" : view.waitingCount === 0 ? "Belum ada antrian" : "Siap memanggil"}
          </p>
        )}
        <p className="mt-3 text-lg">Menunggu: {view.waitingCount}</p>
      </div>

      {confirm ? (
        <div role="dialog" className="rounded-[var(--radius-card)] bg-brand-white p-4">
          <p className="font-bold">
            {confirm === "close" ? "Tutup loket ini?" : "Tandai nomor ini tidak hadir?"}
          </p>
          <div className="mt-3 flex gap-3">
            <BrandButton disabled={locked} onClick={() => onAction(confirm === "close" ? "close" : "no-show")}>
              Ya
            </BrandButton>
            <BrandButton variant="secondary" onClick={() => onConfirm(null)}>
              Batal
            </BrandButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <BrandButton
            className="w-full text-xl"
            disabled={locked || (!paused && !canCall)}
            onClick={() => onAction(paused ? "open" : "next")}
          >
            {mainLabel}
          </BrandButton>
          {paused ? null : (
            <div className="grid gap-3 sm:grid-cols-2">
              <BrandButton variant="secondary" disabled={locked || !hasActive} onClick={() => onAction("recall")}>
                Panggil ulang
              </BrandButton>
              <BrandButton variant="secondary" disabled={locked || !hasActive} onClick={() => onConfirm("no-show")}>
                Tidak hadir
              </BrandButton>
              <BrandButton variant="secondary" disabled={locked || !hasActive} onClick={() => onAction("finish")}>
                Selesai tanpa memanggil
              </BrandButton>
              <BrandButton variant="secondary" disabled={locked || hasActive} onClick={() => onAction("pause")}>
                Istirahat
              </BrandButton>
            </div>
          )}
          <BrandButton variant="secondary" disabled={locked || hasActive} onClick={() => onConfirm("close")}>
            Tutup loket
          </BrandButton>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-bold text-brand-navy">10 nomor terakhir</h2>
        {view.recent.length === 0 ? (
          <p className="text-ink-muted">Belum ada layanan hari ini.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.recent.map((ticket) => (
              <li key={ticket.id} className="flex items-center justify-between rounded-[var(--radius-card)] bg-brand-white px-3 py-2">
                <span className="font-bold">{ticket.number}</span>
                <span>{ticket.status === "NO_SHOW" ? "Tidak hadir" : ticket.serviceName}</span>
                <span className="tabular-nums">
                  {ticket.handlingSeconds == null ? "—" : formatDuration(ticket.handlingSeconds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ServiceTimer({
  calledAt,
  targetMinutes,
}: {
  calledAt: string | null;
  targetMinutes: number;
}) {
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  if (!calledAt || now === 0) return <p className="mt-3 text-3xl font-bold tabular-nums">&nbsp;</p>;
  const seconds = Math.max(0, Math.floor((now - Date.parse(calledAt)) / 1000));
  const late = seconds > targetMinutes * 60;
  return (
    <p className={late ? "mt-3 text-3xl font-bold text-brand-orange tabular-nums" : "mt-3 text-3xl font-bold text-brand-navy tabular-nums"}>
      {formatDuration(seconds)}
    </p>
  );
}
