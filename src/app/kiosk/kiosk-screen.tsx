"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandHeader } from "@/components/brand/brand-header";
import { useBranding } from "@/components/brand/branding-provider";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { QueueNumber } from "@/components/brand/queue-number";
import { FullscreenButton, useFullscreenOnFirstTouch } from "@/components/ui/fullscreen";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { kioskGrid, MIN_BUTTON_HEIGHT, MAX_BUTTON_HEIGHT } from "@/lib/kiosk/layout";
import { useFitText } from "@/lib/use-fit-text";
import type { TicketOutput } from "@/lib/print/output";
import { kioskApp, readPrinterStatus } from "@/lib/print/kiosk-app";
import { downloadTicketPdf, printTicket } from "@/lib/print/print-ticket";
import { newRequestId } from "@/lib/request-id";
import { useQueueState } from "@/lib/realtime/use-queue-state";
import { useNow } from "@/lib/use-now";

const CONFIRMATION_MS = 4_000;
/** Seberapa sering aplikasi kiosk Windows ditanya status printernya. */
const PRINTER_POLL_MS = 10_000;

type IssuedTicketView = {
  id: string;
  number: string;
  serviceName: string;
  aheadCount: number;
};

export function KioskScreen({ timeZone, output }: { timeZone: string; output: TicketOutput }) {
  // Di browser biasa, sentuhan pertama membuat kiosk memenuhi layar seperti Chrome --kiosk.
  useFullscreenOnFirstTouch();
  const { state, error } = useQueueState();
  const pending = useRef(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [issued, setIssued] = useState<IssuedTicketView | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  // Hanya di aplikasi kiosk Windows: pesan bila printer tidak siap, atau bila tiket terakhir gagal dicetak.
  const [printerProblem, setPrinterProblem] = useState<string | null>(null);
  const [printFailed, setPrintFailed] = useState<string | null>(null);

  useEffect(() => {
    const app = kioskApp();
    if (!app) return;
    let stopped = false;
    const check = async () => {
      const status = await readPrinterStatus(app);
      if (!stopped) setPrinterProblem(status.ready ? null : (status.message ?? "Printer belum siap."));
    };
    void check();
    const timer = window.setInterval(() => void check(), PRINTER_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

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
    setPrintFailed(null);
    const app = kioskApp();
    if (app) {
      // Jangan buat nomor bila printer tidak siap: nasabah tidak akan menerima tiketnya.
      const status = await readPrinterStatus(app);
      if (!status.ready) {
        pending.current = false;
        setBusy(null);
        setPrinterProblem(status.message ?? "Printer belum siap.");
        return;
      }
    }
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, requestId: newRequestId() }),
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
      if (app) {
        void app
          .printTicket(view.id)
          .then((result) => {
            if (!result.ok) setPrintFailed(result.message ?? "Tiket gagal dicetak.");
          })
          .catch(() => setPrintFailed("Tiket gagal dicetak."));
      } else if (output === "pdf") {
        downloadTicketPdf(view);
      } else {
        void printTicket({ id: view.id }).catch(() => undefined);
      }
    } catch {
      pending.current = false;
      setBusy(null);
      setUnavailable(true);
    }
  }

  const { orgName } = useBranding();
  const branchName = state?.settings.branchName || orgName;
  const services = state?.services ?? [];

  return (
    <div className="flex h-dvh select-none flex-col overflow-hidden bg-brand-white">
      <BrandHeader
        branchName={branchName}
        trailing={
          <div className="flex items-center gap-4">
            <FullscreenButton />
            <KioskClock timeZone={timeZone} />
          </div>
        }
      />
      <main className="relative flex min-h-0 flex-1 flex-col px-[clamp(16px,3vw,48px)] py-[clamp(12px,3vh,32px)]">
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
                {printFailed ? (
                  <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-xl font-bold text-danger">
                    Tiket gagal dicetak. Mohon hubungi petugas dan sebutkan nomor di atas.
                  </p>
                ) : (
                  <p className="mt-4 flex items-center justify-center gap-2 text-xl text-ink-muted">
                    <Icon name={output === "pdf" && !kioskApp() ? "download" : "printer"} className="size-6" />
                    {output === "pdf" && !kioskApp() ? "Tiket diunduh sebagai PDF (mode uji tanpa printer)" : "Silakan ambil tiket yang tercetak"}
                  </p>
                )}
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

        {!issued && !unavailable && printerProblem ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center" data-testid="kiosk-printer-problem">
            <span className="flex size-24 items-center justify-center rounded-full bg-orange-soft text-ink">
              <Icon name="printer" className="size-12" />
            </span>
            <p className="text-[40px] font-bold text-brand-navy">Mohon hubungi petugas</p>
            <p className="max-w-xl text-2xl text-ink-muted">{printerProblem} Nomor antrian belum bisa diambil.</p>
          </section>
        ) : null}

        {!issued && !unavailable && !printerProblem && !state ? (
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

        {!issued && !unavailable && !printerProblem && state ? (
          <>
            <div className="mb-[clamp(12px,3vh,32px)] shrink-0 text-center">
              <h1 className="text-[clamp(28px,5vh,48px)] font-bold leading-tight text-brand-navy">Silakan pilih layanan</h1>
              <p className="mt-1 flex items-center justify-center gap-2 text-[clamp(16px,2.6vh,24px)] text-ink-muted [@media(max-height:640px)]:hidden">
                <Icon name="touch" className="size-[1.2em]" />
                Sentuh salah satu tombol untuk mengambil nomor antrian
              </p>
            </div>
            {services.length === 0 ? (
              <p className="m-auto text-[40px] font-bold text-brand-navy">Layanan belum dibuka</p>
            ) : (
              <ServiceGrid count={services.length}>
                {services.map((service) => (
                  <li key={service.id} className="min-h-0 flex items-stretch">
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() => {
                        void chooseService(service.id, service.name);
                      }}
                      className={cn(
                        "group relative flex h-full w-full items-center [container-type:size] gap-[clamp(14px,3cqw,28px)] rounded-[22px] border border-brand-white/10 bg-brand-navy px-[clamp(16px,3.5cqw,32px)] py-4 text-left text-brand-white shadow-card transition-[background-color,transform,box-shadow,border-color] duration-150 hover:border-brand-sky/40 hover:bg-brand-blue focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-sky active:scale-[0.98] active:shadow-glow disabled:opacity-60",
                        busy === service.id ? "shadow-glow ring-4 ring-brand-sky" : null,
                      )}
                    >
                      <span
                        className="flex size-[clamp(44px,7.5cqh,60px)] shrink-0 items-center justify-center rounded-2xl bg-brand-white/10 text-[clamp(22px,4cqh,30px)] font-black text-brand-white tabular-nums shadow-inner transition-colors group-hover:bg-brand-white/20"
                        aria-hidden="true"
                      >
                        {service.prefix}
                      </span>
                      <ServiceLabel name={service.name} waitingCount={service.waitingCount} />
                      {busy === service.id ? (
                        <span className="size-8 shrink-0 animate-spin rounded-full border-4 border-brand-white/30 border-t-brand-white" aria-hidden="true" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-white/10 text-brand-white transition-all group-hover:translate-x-1 group-hover:bg-brand-white/20 @max-[340px]:hidden">
                          <Icon name="arrowRight" className="size-5 shrink-0" />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ServiceGrid>
            )}
          </>
        ) : null}
      </main>
      <DiagonalStripes />
    </div>
  );
}

const GRID_GAP = { x: 56, y: 28 };

/**
 * Nama layanan, dan jumlah menunggu bila ada. Ukuran huruf paling besar 28 px dan dikecilkan otomatis
 * sampai semuanya muat di tombol, jadi nama panjang seperti "Kartu ATM & Mobile Banking" tidak terpotong.
 */
function ServiceLabel({ name, waitingCount }: { name: string; waitingCount: number }) {
  const ref = useFitText<HTMLSpanElement>(28, 15, [name, waitingCount]);
  return (
    <span ref={ref} className="flex h-full min-w-0 flex-1 flex-col justify-center gap-1 overflow-hidden py-1">
      <span className="font-bold leading-tight [overflow-wrap:break-word]">{name}</span>
      {waitingCount > 0 ? (
        <span className="flex items-center gap-1.5 text-[0.65em] font-medium opacity-85">
          <Icon name="users" className="size-[1.1em] shrink-0" />
          {waitingCount} menunggu
        </span>
      ) : null}
    </span>
  );
}

/**
 * Grid tombol layanan yang mengisi sisa layar dengan batasan lebar dan tinggi maksimal
 * agar kartu proporsional, berjarak nyaman, dan tetap responsif di berbagai resolusi layar.
 */
function ServiceGrid({ count, children }: { count: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const grid = size ? kioskGrid(count, size.width, size.height, GRID_GAP) : { columns: 2, rows: Math.ceil(count / 2), scroll: false };
  return (
    <div
      ref={box}
      className={cn(
        "min-h-0 flex-1 w-full mx-auto flex flex-col justify-center",
        count === 1 ? "max-w-md" : count === 2 ? "max-w-4xl" : "max-w-5xl",
        grid.scroll ? "overflow-y-auto" : "overflow-hidden",
      )}
    >
      <ul
        className={cn(
          "grid w-full mx-auto justify-center content-center",
          grid.scroll ? "my-auto" : "h-full max-h-[640px]",
        )}
        style={{
          columnGap: GRID_GAP.x,
          rowGap: GRID_GAP.y,
          gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
          gridTemplateRows: grid.scroll
            ? `repeat(${grid.rows}, minmax(${MIN_BUTTON_HEIGHT}px, ${MAX_BUTTON_HEIGHT}px))`
            : `repeat(${grid.rows}, minmax(${MIN_BUTTON_HEIGHT}px, ${MAX_BUTTON_HEIGHT}px))`,
          visibility: size ? "visible" : "hidden",
        }}
      >
        {children}
      </ul>
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
