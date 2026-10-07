"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatDuration } from "@/lib/format-duration";
import { subscribeQueueEvents, useQueueState } from "@/lib/realtime/use-queue-state";
import type { DaySummary } from "@/lib/admin/summary";

let clockNow = 0;

function subscribeClock(listener: () => void) {
  clockNow = Date.now();
  const timer = setInterval(() => {
    clockNow = Date.now();
    listener();
  }, 1000);
  return () => clearInterval(timer);
}

export function Dashboard({ initial }: { initial: DaySummary }) {
  const { state } = useQueueState();
  const [summary, setSummary] = useState(initial);
  const now = useSyncExternalStore(subscribeClock, () => clockNow, () => 0);

  useEffect(() => {
    return subscribeQueueEvents(() => {
      void fetch("/api/admin/summary", { cache: "no-store" })
        .then(async (response) => {
          if (response.ok) setSummary((await response.json()) as DaySummary);
        })
        .catch(() => undefined);
    });
  }, []);

  const cards = [
    ["Total tiket", String(summary.total)],
    ["Menunggu", String(summary.waiting)],
    ["Sedang ditangani", String(summary.serving)],
    ["Selesai", String(summary.done)],
    ["Tidak hadir", String(summary.noShow)],
    ["Rata-rata tunggu", summary.averageWaitSeconds == null ? "—" : formatDuration(summary.averageWaitSeconds)],
    ["Rata-rata penanganan", summary.averageHandleSeconds == null ? "—" : formatDuration(summary.averageHandleSeconds)],
  ];

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold text-brand-navy">Dasbor</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-[var(--radius-card)] bg-brand-white p-4">
            <p className="text-ink-muted">{label}</p>
            <p className="text-3xl font-bold text-brand-navy tabular-nums">{value}</p>
          </article>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-xl font-bold text-brand-navy">Loket sekarang</h2>
      <div className="overflow-x-auto rounded-[var(--radius-card)] bg-brand-white">
        <table className="w-full text-left">
          <thead className="text-brand-navy">
            <tr>
              <th className="px-4 py-3">Loket</th>
              <th className="px-4 py-3">Petugas</th>
              <th className="px-4 py-3">Nomor</th>
              <th className="px-4 py-3">Lama ditangani</th>
            </tr>
          </thead>
          <tbody>
            {(state?.counters ?? []).map((counter) => {
              const calledAt = counter.activeTicket?.calledAt;
              const seconds = calledAt && now > 0 ? Math.max(0, Math.floor((now - Date.parse(calledAt)) / 1000)) : null;
              const late = seconds != null && seconds > (state?.settings.targetServiceMinutes ?? 10) * 60;
              return (
                <tr key={counter.id} className={late ? "border-l-4 border-brand-orange" : undefined}>
                  <td className="px-4 py-3 font-bold">{counter.name}</td>
                  <td className="px-4 py-3">{counter.officerName ?? "—"}</td>
                  <td className="px-4 py-3 font-bold tabular-nums">{counter.activeTicket?.number ?? "—"}</td>
                  <td className={late ? "px-4 py-3 font-bold text-brand-orange tabular-nums" : "px-4 py-3 tabular-nums"}>
                    {seconds == null ? "—" : formatDuration(seconds)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
