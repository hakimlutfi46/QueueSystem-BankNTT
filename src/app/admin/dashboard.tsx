"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandButton } from "@/components/brand/brand-button";
import { CounterStatusBadge, PrefixTile } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/ui/panel";
import type { DaySummary } from "@/lib/admin/summary";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format-duration";
import { useQueueState } from "@/lib/realtime/use-queue-state";
import { secondsSince, useNow } from "@/lib/use-now";

export function Dashboard({ initial }: { initial: DaySummary }) {
  const { state, connected } = useQueueState();
  const [summary, setSummary] = useState(initial);
  const now = useNow();

  // Angka hari ini diambil ulang setiap keadaan antrian diperbarui: lewat sinyal realtime, atau lewat
  // pengambilan berkala tiap 5 detik saat sambungan realtime putus. Dengan begitu kartu angka tidak
  // berhenti selama sambungan menyambung ulang.
  const asOf = state?.asOf;
  useEffect(() => {
    if (!asOf) return;
    let cancelled = false;
    void fetch("/api/admin/summary", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok && !cancelled) setSummary((await response.json()) as DaySummary);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  const target = state?.settings.targetServiceMinutes ?? 10;
  const counters = state?.counters ?? [];
  const openCounters = counters.filter((counter) => counter.status !== "CLOSED");
  const finished = summary.done + summary.noShow;
  const completion = summary.total > 0 ? Math.round((finished / summary.total) * 100) : 0;

  return (
    <section>
      <PageHeader
        title="Dasbor"
        description={
          <span className="inline-flex items-center gap-2">
            <span
              className={cn("size-2 rounded-full", connected ? "animate-live-dot bg-success text-success" : "bg-brand-orange")}
              aria-hidden="true"
            />
            {connected ? "Tersambung langsung. Angka berubah sendiri saat ada tiket baru." : "Menyambung ulang ke server…"}
          </span>
        }
        actions={
          <>
            <BrandButton href="/admin/reports/daily" variant="outline" size="sm">
              <Icon name="chart" className="size-4" />
              Laporan hari ini
            </BrandButton>
            <BrandButton href="/admin/counters" size="sm">
              <Icon name="desk" className="size-4" />
              Atur loket
            </BrandButton>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total tiket" value={summary.total} icon="ticket" hint={`${completion}% sudah selesai dilayani`} />
        <StatCard label="Menunggu" value={summary.waiting} icon="clock" tone="orange" />
        <StatCard label="Sedang ditangani" value={summary.serving} icon="megaphone" tone="sky" />
        <StatCard
          label="Selesai"
          value={summary.done}
          icon="check"
          tone="success"
          hint={summary.noShow > 0 ? `${summary.noShow} tidak hadir` : "Belum ada yang tidak hadir"}
        />
        <StatCard
          label="Rata-rata tunggu"
          value={summary.averageWaitSeconds == null ? "—" : formatDuration(summary.averageWaitSeconds)}
          icon="clock"
          tone="sky"
        />
        <StatCard
          label="Rata-rata penanganan"
          value={summary.averageHandleSeconds == null ? "—" : formatDuration(summary.averageHandleSeconds)}
          icon="user"
          tone={summary.averageHandleSeconds != null && summary.averageHandleSeconds > target * 60 ? "orange" : "navy"}
          hint={`Target ${target} menit`}
        />
        <StatCard label="Loket buka" value={`${openCounters.length}/${counters.length}`} icon="desk" />
        <StatCard label="Tidak hadir" value={summary.noShow} icon="userX" tone="danger" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Loket sekarang" description="Baris oranye sudah melewati target penanganan." bodyClassName="p-0">
          {counters.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="desk"
                title="Belum ada loket aktif"
                action={<Link href="/admin/counters" className="font-bold text-brand-blue">Tambah loket</Link>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-ink-muted">
                  <tr>
                    <th className="px-5 py-3 font-bold">Loket</th>
                    <th className="px-3 py-3 font-bold">Status</th>
                    <th className="px-3 py-3 font-bold">Petugas</th>
                    <th className="px-3 py-3 font-bold">Nomor</th>
                    <th className="px-5 py-3 font-bold">Lama ditangani</th>
                  </tr>
                </thead>
                <tbody>
                  {counters.map((counter) => {
                    const seconds = secondsSince(counter.activeTicket?.calledAt, now);
                    const late = seconds != null && seconds > target * 60;
                    return (
                      <tr key={counter.id} className={cn("border-t border-line", late ? "bg-orange-soft" : null)}>
                        <td className={cn("px-5 py-3 font-bold", late ? "border-l-4 border-brand-orange" : null)}>{counter.name}</td>
                        <td className="px-3 py-3">
                          <CounterStatusBadge status={counter.status} />
                        </td>
                        <td className="px-3 py-3">{counter.status === "CLOSED" ? "—" : (counter.officerName ?? "—")}</td>
                        <td className="px-3 py-3 text-base font-bold text-brand-navy tabular-nums">
                          {counter.activeTicket?.number ?? "—"}
                        </td>
                        <td className={cn("px-5 py-3 tabular-nums", late ? "font-bold text-ink" : null)}>
                          {seconds == null ? "—" : formatDuration(seconds)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Antrian per layanan" description="Jumlah menunggu dan loket yang sedang melayani.">
          {(state?.services ?? []).length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada layanan aktif.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(state?.services ?? []).map((service) => {
                const serving = counters.filter(
                  (counter) => counter.status === "OPEN" && counter.serviceIds.includes(service.id),
                ).length;
                const max = Math.max(1, ...(state?.services ?? []).map((item) => item.waitingCount));
                return (
                  <li key={service.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-3">
                      <PrefixTile prefix={service.prefix} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{service.name}</p>
                        <p className={cn("text-xs", serving === 0 && service.waitingCount > 0 ? "font-bold text-danger" : "text-ink-muted")}>
                          {serving === 0 ? "Tidak ada loket buka" : `${serving} loket melayani`}
                        </p>
                      </div>
                      <p className="text-2xl font-bold text-brand-navy tabular-nums">{service.waitingCount}</p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-brand-sky transition-[width] duration-500"
                        style={{ width: `${(service.waitingCount / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}
