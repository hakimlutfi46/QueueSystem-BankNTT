"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandHeader } from "@/components/brand/brand-header";
import { QueueNumber } from "@/components/brand/queue-number";
import { printTicket } from "@/lib/print/print-ticket";
import { useQueueState } from "@/lib/realtime/use-queue-state";

const CONFIRMATION_MS = 4_000;

type IssuedTicketView = {
  id: string;
  number: string;
  aheadCount: number;
};

export function KioskScreen({ timeZone }: { timeZone: string }) {
  const { state, error } = useQueueState();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedTicketView | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!issued) return;
    const timer = window.setTimeout(() => {
      pending.current = false;
      setBusy(false);
      setIssued(null);
    }, CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [issued]);

  async function chooseService(serviceId: number) {
    if (pending.current || issued) return;
    pending.current = true;
    setBusy(true);
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
        aheadCount: payload.aheadCount,
      };
      setIssued(view);
      void printTicket({ id: view.id }).catch(() => undefined);
    } catch {
      pending.current = false;
      setBusy(false);
      setUnavailable(true);
    }
  }

  const branchName = state?.settings.branchName || "Bank NTT";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-brand-white">
      <BrandHeader branchName={branchName} trailing={<KioskClock timeZone={timeZone} />} />
      <main className="flex min-h-0 flex-1 flex-col px-6 py-8">
        {issued ? (
          <section
            className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
            data-ticket-id={issued.id}
            aria-live="polite"
          >
            <p className="text-2xl font-bold">Nomor antrian Anda</p>
            <QueueNumber value={issued.number} size="kiosk" />
            <p className="text-2xl font-bold">{issued.aheadCount} antrian di depan Anda</p>
          </section>
        ) : null}

        {!issued && unavailable ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <p className="text-[40px] font-bold">Mohon hubungi petugas</p>
            <BrandButton
              size="touch"
              onClick={() => {
                setUnavailable(false);
              }}
            >
              Coba lagi
            </BrandButton>
          </section>
        ) : null}

        {!issued && !unavailable && !state ? (
          <p className="m-auto text-2xl font-bold">
            {error ? "Mohon hubungi petugas" : "Memuat layanan"}
          </p>
        ) : null}

        {!issued && !unavailable && state ? (
          <>
            <h1 className="mb-6 text-center text-[40px] font-bold text-brand-navy">Silakan pilih layanan</h1>
            <ul className="grid min-h-0 flex-1 content-start gap-6 sm:grid-cols-2">
              {state.services.map((service) => (
                <li key={service.id}>
                  <BrandButton
                    size="touch"
                    className="h-full w-full flex-col gap-2"
                    disabled={busy}
                    onClick={() => {
                      void chooseService(service.id);
                    }}
                  >
                    <span>{service.name}</span>
                    <span className="text-[28px]">{service.prefix}</span>
                    <span className="text-[28px]">{service.waitingCount} menunggu</span>
                  </BrandButton>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </main>
    </div>
  );
}

function KioskClock({ timeZone }: { timeZone: string }) {
  const mounted = useSyncExternalStore(
    subscribeClock,
    () => true,
    () => false,
  );
  return (
    <p className="text-base font-bold tabular-nums">{mounted ? formatClock(timeZone) : "\u00a0"}</p>
  );
}

function subscribeClock(onChange: () => void): () => void {
  const timer = setInterval(onChange, 1_000);
  return () => clearInterval(timer);
}

function formatClock(timeZone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}
