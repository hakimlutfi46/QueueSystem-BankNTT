"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { QueueNumber } from "@/components/brand/queue-number";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { counterPages } from "@/lib/display/layout";
import { announcementScript } from "@/lib/speech/announcement";
import { createBrowserPlayer } from "@/lib/speech/browser-player";
import { createAnnouncementQueue } from "@/lib/speech/queue";
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
  const [pageIndex, setPageIndex] = useState(0);
  const primed = useRef(false);
  const audible = useRef(true);

  useEffect(() => {
    audible.current = state?.settings.voiceEnabled !== false;
  }, [state]);

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

  const openCounters = state?.counters.filter((counter) => counter.status === "OPEN") ?? [];
  const layout = counterPages(openCounters);
  const currentPage = pageIndex < layout.pages.length ? pageIndex : 0;
  const page = layout.pages[currentPage] ?? [];

  useEffect(() => {
    if (layout.pages.length <= 1) return;
    const timer = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % layout.pages.length);
    }, PAGE_MS);
    return () => window.clearInterval(timer);
  }, [layout.pages.length]);

  if (!state) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-6 bg-brand-deep text-3xl font-bold text-brand-white">
        <span className="size-16 animate-spin rounded-full border-4 border-brand-white/20 border-t-brand-white" aria-hidden="true" />
        Memuat layar
      </main>
    );
  }

  const lastCall = state.lastCall;
  const blinking = lastCall != null && highlight === lastCall.id;
  const lastService = lastCall ? state.services.find((service) => service.id === lastCall.serviceId) : undefined;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-brand-deep text-brand-white">
      <header className="flex items-center gap-6 bg-brand-navy px-8 py-4">
        <div className="rounded-xl bg-brand-white px-4 py-2">
          <BrandLogo variant="color" priority className="h-14" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-3xl font-bold">{state.settings.branchName}</p>
          <p className="text-lg font-bold opacity-90">melayani lebih sungguh</p>
        </div>
        <div className="ml-auto text-right">
          <DisplayClock timeZone={timeZone} />
          {!connected ? (
            <p data-testid="display-connection" className="mt-1 inline-flex items-center gap-2 text-base font-bold text-brand-orange">
              <span className="size-2 rounded-full bg-brand-orange" aria-hidden="true" />
              Menyambung ulang
            </p>
          ) : null}
        </div>
      </header>
      <DiagonalStripes className="h-2" />

      <div className="flex min-h-0 flex-1">
        <section className="relative flex w-3/5 flex-col items-center justify-center px-10 text-center">
          <p className="text-3xl font-bold uppercase tracking-[0.2em] opacity-90">
            {lastCall ? "Nomor antrian" : "Selamat datang"}
          </p>
          {lastCall ? (
            <>
              <div data-testid="last-call" className="my-2">
                <QueueNumber
                  key={lastCall.id}
                  value={lastCall.ticketNumber}
                  size="tvHero"
                  tone="orange"
                  className={cn("drop-shadow-[0_8px_40px_var(--brand-deep)]", blinking ? "animate-call-blink" : "animate-pop-in")}
                />
              </div>
              <p className="text-3xl font-bold opacity-90">Silakan menuju</p>
              <p className="mt-3 rounded-[var(--radius-card)] border-4 border-brand-white px-10 py-3 text-6xl font-bold">
                {lastCall.counterName ?? "Loket"}
              </p>
              {lastService ? <p className="mt-4 text-2xl opacity-80">{lastService.name}</p> : null}
            </>
          ) : (
            <>
              <QueueNumber value="—" size="tv" tone="orange" />
              <p className="mt-4 text-5xl font-bold">Belum ada panggilan</p>
              <p className="mt-3 text-2xl opacity-80">Silakan ambil nomor antrian di mesin tiket.</p>
            </>
          )}
          <div
            className="absolute inset-y-0 right-0 w-4 bg-brand-orange"
            style={{ clipPath: "polygon(45% 0, 100% 0, 55% 100%, 0 100%)" }}
            aria-hidden="true"
          />
        </section>

        <section className="flex w-2/5 flex-col px-6 py-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-2xl font-bold">Loket</p>
            {layout.pages.length > 1 ? (
              <div className="flex gap-2" aria-label={`Halaman ${currentPage + 1} dari ${layout.pages.length}`}>
                {layout.pages.map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      index === currentPage ? "w-8 bg-brand-white" : "w-2 bg-brand-white/40",
                    )}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div
            className={cn(
              "grid min-h-0 flex-1 content-center gap-4",
              layout.columns === 1 ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {page.length === 0 ? (
              <p className="text-center text-2xl font-bold opacity-80">Belum ada loket yang buka</p>
            ) : (
              page.map((counter) => {
                const latest = lastCall?.counterId === counter.id && counter.activeTicket != null;
                return (
                  <article
                    key={counter.id}
                    data-testid={`counter-${counter.id}`}
                    className={cn(
                      "relative overflow-hidden rounded-[var(--radius-card)] bg-brand-white px-5 text-brand-navy transition-shadow",
                      layout.columns === 1 ? "flex items-center justify-between py-5" : "py-4 text-center",
                      latest ? "shadow-[0_0_0_4px_var(--brand-orange)]" : "shadow-glow",
                    )}
                  >
                    {latest ? <span className="absolute inset-x-0 top-0 h-1.5 bg-brand-orange" aria-hidden="true" /> : null}
                    <p className={cn("font-bold", layout.columns === 1 ? "text-3xl" : "text-2xl")}>{counter.name}</p>
                    <p
                      className={cn(
                        "font-bold leading-none tabular-nums",
                        layout.columns === 1 ? "text-7xl" : "mt-2 text-6xl",
                        counter.activeTicket ? null : "text-brand-grey",
                      )}
                    >
                      {counter.activeTicket?.number ?? "—"}
                    </p>
                  </article>
                );
              })
            )}
          </div>
          {state.services.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {state.services.map((service) => (
                <li key={service.id} className="flex items-center gap-2 rounded-full bg-brand-navy px-3 py-1.5 text-lg font-bold">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-white text-sm text-brand-navy">
                    {service.prefix}
                  </span>
                  {service.waitingCount} menunggu
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      {state.settings.runningText ? (
        <div className="flex items-center overflow-hidden bg-brand-navy">
          <span className="z-10 flex shrink-0 items-center gap-2 bg-brand-orange px-5 py-3 text-xl font-bold text-ink">
            <Icon name="megaphone" className="size-6" />
            Info
          </span>
          <div className="min-w-0 flex-1 overflow-hidden py-3">
            <p className="animate-running-text whitespace-nowrap text-2xl font-bold">{state.settings.runningText}</p>
          </div>
        </div>
      ) : null}
      <DiagonalStripes />

      {state.settings.voiceEnabled && !soundOn ? (
        <div className="absolute inset-x-0 bottom-24 flex justify-center">
          <BrandButton
            size="lg"
            className="shadow-glow"
            onClick={() => {
              announcements.enable();
              setSoundOn(true);
            }}
          >
            <Icon name="volume" className="size-6" />
            Aktifkan suara
          </BrandButton>
        </div>
      ) : null}
    </main>
  );
}

function DisplayClock({ timeZone }: { timeZone: string }) {
  const now = useNow();
  if (now === 0) return <p className="text-4xl font-bold">{" "}</p>;
  const date = new Date(now);
  return (
    <>
      <p className="text-4xl font-bold tabular-nums">
        {new Intl.DateTimeFormat("id-ID", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date)}
      </p>
      <p className="text-lg font-bold opacity-90">
        {new Intl.DateTimeFormat("id-ID", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date)}
      </p>
    </>
  );
}
