"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandLogo, BrandTagline } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import {
  COUNTERS_PER_PAGE,
  heroNumberSize,
  paginate,
  SERVICES_PER_PAGE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  stageFit,
} from "@/lib/display/layout";
import { announcementScript } from "@/lib/speech/announcement";
import { createBrowserPlayer, unlockAudio } from "@/lib/speech/browser-player";
import { createAnnouncementQueue } from "@/lib/speech/queue";
import type { QueueCounterState } from "@/lib/realtime/types";
import { subscribeQueueEvents, useQueueState } from "@/lib/realtime/use-queue-state";
import { useNow } from "@/lib/use-now";

const PAGE_MS = 8_000;

export function DisplayScreen({ timeZone }: { timeZone: string }) {
  const { state, connected } = useQueueState();
  const [announcements] = useState(() => createAnnouncementQueue(createBrowserPlayer()));
  const highlight = useSyncExternalStore(
    announcements.subscribe,
    announcements.getHighlight,
    announcements.getServerHighlight,
  );
  const [soundOn, setSoundOn] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const primed = useRef(false);
  const audible = useRef(true);

  useEffect(() => {
    audible.current = state?.settings.voiceEnabled !== false;
  }, [state]);

  // Suara menyala sendiri. TV yang dijalankan dengan --autoplay-policy=no-user-gesture-required langsung
  // berbunyi; bila browser menolak, sentuhan atau tombol apa pun pertama kali di layar ini menyalakannya.
  useEffect(() => {
    let active = true;
    const turnOn = async () => {
      const allowed = await unlockAudio();
      if (!active) return allowed;
      if (allowed) {
        announcements.enable();
        setSoundOn(true);
        setSoundBlocked(false);
      } else {
        setSoundBlocked(true);
      }
      return allowed;
    };
    void turnOn();
    const onGesture = () => {
      void turnOn().then((allowed) => {
        if (allowed) removeListeners();
      });
    };
    const removeListeners = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      active = false;
      removeListeners();
    };
  }, [announcements]);

  useEffect(() => {
    if (!state || primed.current) return;
    primed.current = true;
    if (state.lastCall) announcements.seen(state.lastCall.id);
  }, [announcements, state]);

  useEffect(() => {
    return subscribeQueueEvents((event) => {
      if (event.type !== "TICKET_CALLED" && event.type !== "TICKET_RECALLED") return;
      if (!event.id || !event.ticketNumber) return;
      const script = announcementScript(
        event.ticketNumber,
        event.counterName ?? "",
        event.displayNumber ?? 1,
      );
      announcements.announce({
        id: event.id,
        text: script.text,
        clips: script.clips,
        audible: audible.current,
      });
    });
  }, [announcements]);

  // Semua loket aktif tampil dengan statusnya; urut nama supaya CS dan Teller berkelompok.
  const allCounters = [...(state?.counters ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name, "id", { numeric: true }),
  );
  const counterPages = paginate(allCounters, COUNTERS_PER_PAGE);
  const servicePages = paginate(state?.services ?? [], SERVICES_PER_PAGE);
  const counterPage = useRotatingPage(counterPages.length);
  const servicePage = useRotatingPage(servicePages.length);

  if (!state) {
    return (
      <Stage>
        <div className="flex h-full flex-col items-center justify-center gap-6 text-4xl font-bold">
          <span className="size-20 animate-spin rounded-full border-4 border-brand-white/20 border-t-brand-white" aria-hidden="true" />
          Memuat layar
        </div>
      </Stage>
    );
  }

  const lastCall = state.lastCall;
  const blinking = lastCall != null && highlight === lastCall.id;
  const lastService = lastCall ? state.services.find((service) => service.id === lastCall.serviceId) : undefined;
  const previousCalls = state.recentCalls.filter((call) => call.ticketId !== lastCall?.ticketId).slice(0, 4);
  const counters = counterPages[counterPage] ?? [];
  const services = servicePages[servicePage] ?? [];

  return (
    <Stage>
      <div className="flex h-full flex-col">
        <header className="flex h-[112px] shrink-0 items-center gap-6 bg-brand-navy px-10">
          <div className="rounded-xl bg-brand-white px-4 py-2">
            <BrandLogo variant="color" priority className="h-14" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[34px] font-bold leading-tight">{state.settings.branchName}</p>
            <BrandTagline className="truncate text-xl font-bold opacity-90" />
          </div>
          {state.settings.voiceEnabled && !soundOn && soundBlocked ? (
            <BrandButton
              className="shrink-0 shadow-glow"
              onClick={() => {
                void unlockAudio().then(() => {
                  announcements.enable();
                  setSoundOn(true);
                });
              }}
            >
              <Icon name="volume" className="size-5" />
              Aktifkan suara
            </BrandButton>
          ) : null}
          <div className="shrink-0 text-right">
            <DisplayClock timeZone={timeZone} />
            {!connected ? (
              <p data-testid="display-connection" className="inline-flex items-center gap-2 text-lg font-bold text-brand-orange">
                <span className="size-2.5 rounded-full bg-brand-orange" aria-hidden="true" />
                Menyambung ulang
              </p>
            ) : null}
          </div>
        </header>
        <DiagonalStripes className="h-2 shrink-0" />

        <div className="grid min-h-0 flex-1 grid-cols-[640px_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Kiri: nomor yang sedang dipanggil, lalu panggilan sebelumnya. */}
          <section className="relative flex min-h-0 flex-col px-10 pb-8 pt-6">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
              <p className="text-[28px] font-bold uppercase tracking-[0.25em] opacity-90">
                {lastCall ? "Nomor antrian" : "Selamat datang"}
              </p>
              {lastCall ? (
                <>
                  <p
                    key={lastCall.id}
                    data-testid="last-call"
                    className={cn(
                      "my-1 font-bold leading-none text-brand-orange tabular-nums",
                      blinking ? "animate-call-blink" : "animate-pop-in",
                    )}
                    style={{ fontSize: heroNumberSize(lastCall.ticketNumber) }}
                  >
                    {lastCall.ticketNumber}
                  </p>
                  <p className="text-[30px] font-bold opacity-90">Silakan menuju</p>
                  <p className="mt-3 max-w-full truncate rounded-[var(--radius-card)] border-4 border-brand-white px-10 py-2 text-[56px] font-bold leading-tight">
                    {lastCall.counterName ?? "Loket"}
                  </p>
                  {lastService ? <p className="mt-3 max-w-full truncate text-2xl opacity-80">{lastService.name}</p> : null}
                </>
              ) : (
                <>
                  <p className="my-4 text-[180px] font-bold leading-none text-brand-orange">—</p>
                  <p className="text-[44px] font-bold leading-tight">Belum ada panggilan</p>
                  <p className="mt-3 text-2xl opacity-80">Silakan ambil nomor antrian di mesin tiket.</p>
                </>
              )}
            </div>

            <div className="shrink-0">
              <SectionTitle>Panggilan sebelumnya</SectionTitle>
              {previousCalls.length === 0 ? (
                <p className="rounded-[var(--radius-card)] border-2 border-dashed border-brand-white/25 px-5 py-5 text-xl opacity-70">
                  Belum ada panggilan lain hari ini.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3" data-testid="previous-calls">
                  {previousCalls.map((call) => (
                    <li key={call.ticketId} className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-brand-navy px-5 py-3">
                      <p className="text-[40px] font-bold leading-none tabular-nums">{call.ticketNumber}</p>
                      <p className="min-w-0 truncate text-right text-xl font-bold opacity-90">{call.counterName ?? "Loket"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              className="absolute inset-y-0 right-0 w-4 bg-brand-orange"
              style={{ clipPath: "polygon(45% 0, 100% 0, 55% 100%, 0 100%)" }}
              aria-hidden="true"
            />
          </section>

          {/* Tengah: antrean per layanan. */}
          <section className="flex min-h-0 flex-col px-8 pb-8 pt-6">
            <SectionTitle pages={servicePages.length} page={servicePage}>
              Antrian
            </SectionTitle>
            {services.length === 0 ? (
              <p className="text-2xl opacity-80">Belum ada layanan.</p>
            ) : (
              <>
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_120px_150px] gap-3 px-4 text-sm font-bold uppercase tracking-wider opacity-70">
                  <span>Layanan</span>
                  <span className="text-right">Menunggu</span>
                  <span className="text-right">Berikutnya</span>
                </div>
                <ul className="flex min-h-0 flex-1 flex-col gap-2" data-testid="service-queues">
                  {services.map((service) => (
                    <li
                      key={service.id}
                      className="grid h-[84px] shrink-0 grid-cols-[minmax(0,1fr)_120px_150px] items-center gap-3 rounded-[var(--radius-card)] bg-brand-navy px-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-white text-2xl font-bold text-brand-navy">
                          {service.prefix}
                        </span>
                        <p className="line-clamp-2 min-w-0 text-[22px] font-bold leading-tight">{service.name}</p>
                      </div>
                      <p className="text-right text-[44px] font-bold leading-none tabular-nums">{service.waitingCount}</p>
                      <p className="text-right text-[34px] font-bold leading-none text-brand-orange tabular-nums">
                        {service.nextNumber ?? <span className="text-brand-white/40">—</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Kanan: loket yang buka dan nomor yang sedang dilayani. */}
          <section className="flex min-h-0 flex-col pb-8 pl-2 pr-10 pt-6">
            <SectionTitle pages={counterPages.length} page={counterPage}>
              Loket
            </SectionTitle>
            {counters.length === 0 ? (
              <p className="text-2xl opacity-80">Belum ada loket.</p>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-5 gap-3">
                {counters.map((counter) => (
                  <CounterCard
                    key={counter.id}
                    counter={counter}
                    latest={lastCall?.counterId === counter.id && counter.activeTicket != null}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {state.settings.runningText ? (
          <div className="flex h-[64px] shrink-0 items-center overflow-hidden bg-brand-navy">
            <span className="z-10 flex h-full shrink-0 items-center gap-2 bg-brand-orange px-6 text-2xl font-bold text-ink">
              <Icon name="megaphone" className="size-7" />
              Info
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="animate-running-text whitespace-nowrap text-[28px] font-bold">{state.settings.runningText}</p>
            </div>
          </div>
        ) : null}
        <DiagonalStripes className="shrink-0" />
      </div>
    </Stage>
  );
}

const COUNTER_STATUS: Record<QueueCounterState["status"], { label: string; className: string }> = {
  OPEN: { label: "Buka", className: "bg-success-soft text-success" },
  PAUSED: { label: "Istirahat", className: "bg-orange-soft text-ink" },
  CLOSED: { label: "Tutup", className: "bg-surface text-ink-muted" },
};

/** Satu loket di TV: nama, status, dan nomor yang sedang dilayani. Nomor berikutnya ada di kolom Antrian. */
function CounterCard({ counter, latest }: { counter: QueueCounterState; latest: boolean }) {
  const status = COUNTER_STATUS[counter.status];
  const open = counter.status === "OPEN";
  return (
    <article
      data-testid={`counter-${counter.id}`}
      className={cn(
        "relative flex min-h-0 flex-col justify-between overflow-hidden rounded-[var(--radius-card)] px-5 py-3",
        open ? "bg-brand-white text-brand-navy" : "bg-brand-white/85 text-brand-navy",
        latest ? "shadow-[0_0_0_4px_var(--brand-orange)]" : open ? "shadow-glow" : null,
      )}
    >
      {latest ? <span className="absolute inset-y-0 left-0 w-2 bg-brand-orange" aria-hidden="true" /> : null}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-2xl font-bold">{counter.name}</p>
        <span className={cn("shrink-0 rounded-full px-3 py-1 text-base font-bold", status.className)}>{status.label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p
          className={cn(
            "min-w-0 font-bold leading-none tabular-nums",
            counter.activeTicket ? "text-[52px]" : "text-[40px] text-brand-grey",
          )}
        >
          {counter.activeTicket?.number ?? "—"}
        </p>
        {open ? null : (
          <p className="shrink-0 pb-1 text-lg font-bold text-ink-muted">
            {counter.status === "PAUSED" ? "Sedang istirahat" : "Tidak melayani"}
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * Kanvas 1920×1080 yang diskalakan ke layar sebenarnya, seperti papan informasi digital. TV 42 inci,
 * monitor, maupun laptop menampilkan susunan yang sama tanpa ada yang terpotong atau meluber.
 */
function Stage({ children }: { children: ReactNode }) {
  const size = useSyncExternalStore(subscribeResize, readWindowSize, () => `${STAGE_WIDTH}x${STAGE_HEIGHT}`);
  const [width, height] = size.split("x").map(Number);
  const fit = stageFit(width ?? STAGE_WIDTH, height ?? STAGE_HEIGHT);
  return (
    <main className="fixed inset-0 overflow-hidden bg-brand-deep text-brand-white">
      <div
        className="absolute origin-top-left overflow-hidden"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          left: fit.left,
          top: fit.top,
          transform: `scale(${fit.scale})`,
        }}
      >
        {children}
      </div>
    </main>
  );
}

function subscribeResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readWindowSize(): string {
  return `${window.innerWidth}x${window.innerHeight}`;
}

/** Halaman yang bergantian tiap 8 detik bila isinya lebih dari satu halaman. */
function useRotatingPage(count: number): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count <= 1) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), PAGE_MS);
    return () => window.clearInterval(timer);
  }, [count]);
  return index < count ? index : 0;
}

function SectionTitle({ children, pages = 1, page = 0 }: { children: ReactNode; pages?: number; page?: number }) {
  return (
    <div className="mb-3 flex h-9 shrink-0 items-center justify-between">
      <p className="text-2xl font-bold uppercase tracking-[0.2em] opacity-90">{children}</p>
      {pages > 1 ? (
        <div className="flex items-center gap-2" aria-label={`Halaman ${page + 1} dari ${pages}`}>
          {Array.from({ length: pages }, (_, index) => (
            <span
              key={index}
              className={cn("h-2.5 rounded-full transition-all", index === page ? "w-9 bg-brand-white" : "w-2.5 bg-brand-white/40")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DisplayClock({ timeZone }: { timeZone: string }) {
  const now = useNow();
  if (now === 0) return <p className="text-[42px] font-bold">{" "}</p>;
  const date = new Date(now);
  return (
    <>
      <p className="text-[42px] font-bold leading-tight tabular-nums">
        {new Intl.DateTimeFormat("id-ID", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date)}
      </p>
      <p className="text-lg font-bold opacity-90">
        {new Intl.DateTimeFormat("id-ID", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date)}
      </p>
    </>
  );
}
