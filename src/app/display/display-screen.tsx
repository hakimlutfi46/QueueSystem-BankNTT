"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { QueueNumber } from "@/components/brand/queue-number";
import { counterPages } from "@/lib/display/layout";
import { announcementScript } from "@/lib/speech/announcement";
import { createBrowserPlayer } from "@/lib/speech/browser-player";
import { createAnnouncementQueue } from "@/lib/speech/queue";
import { subscribeQueueEvents, useQueueState } from "@/lib/realtime/use-queue-state";

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
  const page = layout.pages[pageIndex] ?? layout.pages[0] ?? [];

  useEffect(() => {
    if (layout.pages.length <= 1) return;
    const timer = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % layout.pages.length);
    }, PAGE_MS);
    return () => window.clearInterval(timer);
  }, [layout.pages.length]);

  if (!state) {
    return (
      <main className="flex h-dvh items-center justify-center bg-brand-deep text-3xl font-bold text-brand-white">
        Memuat layar
      </main>
    );
  }

  const lastCall = state.lastCall;
  const blinking = lastCall != null && highlight === lastCall.id;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-brand-deep text-brand-white">
      <header className="flex items-center gap-6 px-8 py-4">
        <BrandLogo variant="onBlue" priority className="h-16" />
        <div className="min-w-0">
          <p className="truncate text-3xl font-bold">{state.settings.branchName}</p>
          <p className="text-lg font-bold">melayani lebih sungguh</p>
        </div>
        <div className="ml-auto text-right">
          <DisplayClock timeZone={timeZone} />
          {!connected ? (
            <p data-testid="display-connection" className="text-base font-bold text-brand-orange">
              Menyambung ulang
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="relative flex w-3/5 flex-col items-center justify-center px-8 text-center">
          {lastCall ? (
            <>
              <div data-testid="last-call">
                <QueueNumber
                  key={lastCall.id}
                  value={lastCall.ticketNumber}
                  size="tv"
                  tone="orange"
                  className={blinking ? "animate-call-blink" : undefined}
                />
              </div>
              <p className="mt-4 text-5xl font-bold">{lastCall.counterName ?? "Loket"}</p>
            </>
          ) : (
            <>
              <QueueNumber value="—" size="tv" tone="orange" />
              <p className="mt-4 text-5xl font-bold">Belum ada panggilan</p>
            </>
          )}
          <div
            className="absolute inset-y-0 right-0 w-4 bg-brand-orange"
            style={{ clipPath: "polygon(45% 0, 100% 0, 55% 100%, 0 100%)" }}
            aria-hidden="true"
          />
        </section>

        <section
          className={
            layout.columns === 1
              ? "grid w-2/5 content-center gap-4 px-6 py-4"
              : "grid w-2/5 grid-cols-2 content-center gap-4 px-6 py-4"
          }
        >
          {page.length === 0 ? (
            <p className="text-2xl font-bold">Belum ada loket yang buka</p>
          ) : (
            page.map((counter) => (
              <article
                key={counter.id}
                data-testid={`counter-${counter.id}`}
                className="rounded-[var(--radius-card)] bg-brand-white px-4 py-5 text-center text-brand-navy shadow-[0_0_24px_var(--brand-sky)]"
              >
                <p className="text-2xl font-bold">{counter.name}</p>
                <p className="mt-2 text-6xl font-bold leading-none tabular-nums">
                  {counter.activeTicket?.number ?? "—"}
                </p>
              </article>
            ))
          )}
        </section>
      </div>

      {state.settings.runningText ? (
        <div className="overflow-hidden bg-brand-navy py-3">
          <p className="animate-running-text whitespace-nowrap text-2xl font-bold">
            {state.settings.runningText}
          </p>
        </div>
      ) : null}
      <DiagonalStripes />

      {state.settings.voiceEnabled && !soundOn ? (
        <div className="absolute inset-x-0 bottom-24 flex justify-center">
          <BrandButton
            onClick={() => {
              announcements.enable();
              setSoundOn(true);
            }}
          >
            Aktifkan suara
          </BrandButton>
        </div>
      ) : null}
    </main>
  );
}

function DisplayClock({ timeZone }: { timeZone: string }) {
  const mounted = useSyncExternalStore(subscribeClock, () => true, () => false);
  return (
    <p className="text-2xl font-bold tabular-nums">{mounted ? formatClock(timeZone) : "\u00a0"}</p>
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}
