"use client";

import { useEffect, useRef, useState } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandHeader } from "@/components/brand/brand-header";
import { useBranding } from "@/components/brand/branding-provider";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { QueueNumber } from "@/components/brand/queue-number";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { printTicket } from "@/lib/print/print-ticket";
import { useQueueState } from "@/lib/realtime/use-queue-state";
import { useNow } from "@/lib/use-now";

const CONFIRMATION_MS = 4_000;

type IssuedTicketView = {
  id: string;
  number: string;
  serviceName: string;
  aheadCount: number;
};

/** Jumlah kolom menyesuaikan jumlah layanan supaya tombol tetap besar dan tidak perlu digulir. */
function gridFor(count: number): { grid: string; compact: boolean } {
  if (count <= 1) return { grid: "mx-auto w-full max-w-3xl grid-cols-1", compact: false };
  if (count === 2) return { grid: "grid-cols-1 md:grid-cols-2", compact: false };
  if (count === 3) return { grid: "grid-cols-1 md:grid-cols-3", compact: false };
  if (count === 4) return { grid: "grid-cols-1 md:grid-cols-2", compact: false };
  return { grid: "grid-cols-2 lg:grid-cols-3", compact: true };
}

export function KioskScreen({ timeZone }: { timeZone: string }) {
  const { state, error } = useQueueState();
  const pending = useRef(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [issued, setIssued] = useState<IssuedTicketView | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!issued) return;
    const timer = window.setTimeout(() => {
      pending.current = false;
      setBusy(null);
      setIssued(null);
    }, CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [issued]);

  async function chooseService(serviceId: number, serviceName: string) {
    if (pending.current || issued) return;
    pending.current = true;
    setBusy(serviceId);
    setUnavailable(false);
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, requestId: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error("Ticket was not issued.");
      const payload = (await response.json()) as {
        ticket: { id: string; number: string };
        aheadCount: number;
      };
      const view = {
        id: payload.ticket.id,
        number: payload.ticket.number,
        serviceName,
        aheadCount: payload.aheadCount,
      };
      setIssued(view);
      void printTicket({ id: view.id }).catch(() => undefined);
    } catch {
      pending.current = false;
      setBusy(null);
      setUnavailable(true);
    }
  }

  const { orgName } = useBranding();
  const branchName = state?.settings.branchName || orgName;
  const services = state?.services ?? [];
  const layout = gridFor(services.length);

  return (
    <div className="flex h-dvh select-none flex-col overflow-hidden bg-brand-white">
      <BrandHeader branchName={branchName} trailing={<KioskClock timeZone={timeZone} />} />
      <main className="relative flex min-h-0 flex-1 flex-col px-6 py-8 lg:px-12">
        {issued ? (
          <section
            className="flex flex-1 flex-col items-center justify-center text-center"
            data-ticket-id={issued.id}
            aria-live="polite"
          >
            <div className="animate-pop-in relative w-full max-w-xl overflow-hidden rounded-[var(--radius-card)] border border-line bg-brand-white shadow-glow">
              <div className="bg-brand-navy px-8 py-5 text-brand-white">
                <p className="text-2xl font-bold">Nomor antrian Anda</p>
                <p className="mt-1 text-lg">{issued.serviceName}</p>
              </div>
              <div className="px-8 py-8">
                <QueueNumber value={issued.number} size="kiosk" />
                <div className="my-6 border-t-2 border-dashed border-line" aria-hidden="true" />
                <p className="text-3xl font-bold text-ink">
                  <span className="text-brand-navy tabular-nums">{issued.aheadCount}</span> antrian di depan Anda
                </p>
                <p className="mt-4 flex items-center justify-center gap-2 text-xl text-ink-muted">
                  <Icon name="printer" className="size-6" />
                  Silakan ambil tiket yang tercetak
                </p>
              </div>
              <div className="h-2 bg-surface" aria-hidden="true">
                <div
                  className="animate-countdown h-full bg-brand-sky"
                  style={{ ["--countdown-ms" as string]: `${CONFIRMATION_MS}ms` }}
                />
              </div>
            </div>
          </section>
        ) : null}

        {!issued && unavailable ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <span className="flex size-24 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Icon name="close" className="size-12" />
            </span>
            <p className="text-[40px] font-bold text-brand-navy">Mohon hubungi petugas</p>
            <p className="max-w-xl text-2xl text-ink-muted">Nomor belum bisa dibuat dan tidak ada tiket yang tercetak.</p>
            <BrandButton size="touch" onClick={() => setUnavailable(false)}>
              Coba lagi
            </BrandButton>
          </section>
        ) : null}

        {!issued && !unavailable && !state ? (
          <div className="m-auto flex flex-col items-center gap-4 text-center">
            {error ? (
              <p className="text-[40px] font-bold text-brand-navy">Mohon hubungi petugas</p>
            ) : (
              <>
                <span className="size-14 animate-spin rounded-full border-4 border-sky-soft border-t-brand-navy" aria-hidden="true" />
                <p className="text-2xl font-bold text-brand-navy">Memuat layanan</p>
              </>
            )}
          </div>
        ) : null}

        {!issued && !unavailable && state ? (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-[40px] font-bold leading-tight text-brand-navy lg:text-5xl">Silakan pilih layanan</h1>
              <p className="mt-2 flex items-center justify-center gap-2 text-2xl text-ink-muted">
                <Icon name="touch" className="size-7" />
                Sentuh salah satu tombol untuk mengambil nomor antrian
              </p>
            </div>
            {services.length === 0 ? (
              <p className="m-auto text-[40px] font-bold text-brand-navy">Layanan belum dibuka</p>
            ) : (
              <ul className={cn("grid min-h-0 flex-1 content-center gap-6", layout.grid)}>
                {services.map((service) => (
                  <li key={service.id}>
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() => {
                        void chooseService(service.id, service.name);
                      }}
                      className={cn(
                        "group flex w-full items-center gap-6 rounded-[var(--radius-card)] bg-brand-navy px-8 text-left text-brand-white shadow-card transition-[background-color,transform,box-shadow] duration-150 hover:bg-brand-blue focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-sky active:scale-[0.98] active:shadow-glow disabled:opacity-60",
                        layout.compact ? "min-h-40 py-6" : "min-h-52 py-8",
                        busy === service.id ? "shadow-glow" : null,
                      )}
                    >
                      <span
                        className={cn(
                          "flex shrink-0 items-center justify-center rounded-2xl bg-brand-white font-bold text-brand-navy",
                          layout.compact ? "size-20 text-5xl" : "size-28 text-6xl",
                        )}
                        aria-hidden="true"
                      >
                        {service.prefix}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className={cn("font-bold leading-tight", layout.compact ? "text-[32px]" : "text-[40px]")}>
                          {service.name}
                        </span>
                        <span className="flex items-center gap-2 text-2xl">
                          <Icon name="users" className="size-6" />
                          {service.waitingCount === 0 ? "Tidak ada antrian" : `${service.waitingCount} menunggu`}
                        </span>
                      </span>
                      {busy === service.id ? (
                        <span className="size-10 shrink-0 animate-spin rounded-full border-4 border-brand-white/30 border-t-brand-white" aria-hidden="true" />
                      ) : (
                        <Icon name="arrowRight" className="size-10 shrink-0 transition-transform group-hover:translate-x-1" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </main>
      <DiagonalStripes />
    </div>
  );
}

function KioskClock({ timeZone }: { timeZone: string }) {
  const now = useNow();
  if (now === 0) return <p className="text-base font-bold">{"\u00a0"}</p>;
  const date = new Date(now);
  return (
    <div className="text-right">
      <p className="text-3xl font-bold tabular-nums">
        {new Intl.DateTimeFormat("id-ID", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date)}
      </p>
      <p className="text-sm font-bold">
        {new Intl.DateTimeFormat("id-ID", {
          timeZone,
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(date)}
      </p>
    </div>
  );
}
