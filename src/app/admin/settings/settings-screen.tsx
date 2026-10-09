"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAdmin } from "@/app/admin/submit";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Field, Switch, inputClass } from "@/components/ui/field";
import { useConfirm } from "@/components/ui/confirm";
import { Icon } from "@/components/ui/icon";
import { Alert, PageHeader, Panel } from "@/components/ui/panel";
import type { AdminSettings } from "@/lib/admin/settings";
import { INDONESIA_TIME_ZONES } from "@/lib/env";
import { cn } from "@/lib/cn";

export function SettingsScreen({ settings }: { settings: AdminSettings }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [branchName, setBranchName] = useState(settings.branchName);
  const [footer, setFooter] = useState(settings.ticketFooter);
  const [width, setWidth] = useState(settings.ticketWidthMm);
  const [runningText, setRunningText] = useState(settings.runningText);

  async function save(formData: FormData) {
    const timeZone = String(formData.get("timeZone") ?? settings.timeZone);
    if (timeZone !== settings.timeZone) {
      const next = INDONESIA_TIME_ZONES.find((zone) => zone.id === timeZone);
      const ok = await confirm({
        title: `Ganti zona waktu ke ${next?.label ?? timeZone}?`,
        message:
          "Jam di kiosk, TV, dan tiket ikut berganti. Bila diganti saat cabang sedang buka, tanggal antrian bisa bergeser dan nomor dimulai lagi dari 001. Sebaiknya diganti sebelum cabang buka.",
        confirmLabel: "Ganti zona waktu",
        icon: "clock",
      });
      if (!ok) return;
    }
    setPending(true);
    const message = await submitAdmin("/api/admin/settings", "PUT", {
      branchName: String(formData.get("branchName") ?? ""),
      runningText: String(formData.get("runningText") ?? ""),
      voiceEnabled: formData.get("voiceEnabled") === "on",
      maxRecall: Number(formData.get("maxRecall") ?? 0),
      targetServiceMinutes: Number(formData.get("targetServiceMinutes") ?? 0),
      ticketFooter: String(formData.get("ticketFooter") ?? ""),
      ticketWidthMm: Number(formData.get("ticketWidthMm") ?? 80),
      timeZone: String(formData.get("timeZone") ?? settings.timeZone),
    });
    setPending(false);
    setError(message);
    setSaved(!message);
    if (!message) router.refresh();
  }

  return (
    <section>
      <PageHeader
        title="Pengaturan"
        description="Berlaku untuk cabang ini. Kiosk, TV, dan layar petugas ikut berubah begitu disimpan."
      />
      {error ? <Alert>{error}</Alert> : null}
      {saved ? <Alert tone="success">Pengaturan disimpan dan dikirim ke semua layar.</Alert> : null}

      <form action={save} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" onChange={() => setSaved(false)}>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Identitas cabang" description="Tampil di kiosk, TV, layar petugas, dan tiket.">
            <Field label="Nama cabang">
              <input
                name="branchName"
                required
                maxLength={80}
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                className={inputClass}
              />
            </Field>
          </Panel>

          <Panel title="Zona waktu" description="Dipakai untuk jam di kiosk dan TV, waktu di tiket, pergantian nomor harian, dan laporan.">
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Zona waktu">
              {INDONESIA_TIME_ZONES.map((zone) => (
                <label key={zone.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="timeZone"
                    value={zone.id}
                    defaultChecked={settings.timeZone === zone.id}
                    className="peer sr-only"
                  />
                  <span className="flex flex-col rounded-xl border border-line p-4 transition-colors hover:border-brand-blue peer-checked:border-brand-navy peer-checked:bg-navy-soft peer-focus-visible:ring-4 peer-focus-visible:ring-sky-soft">
                    <span className="text-xl font-bold text-brand-navy">{zone.label}</span>
                    <span className="text-sm text-ink-muted">{zone.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Mengganti zona waktu di tengah hari bisa menggeser tanggal antrian. Lakukan saat cabang belum buka.
            </p>
          </Panel>

          <Panel title="Layar TV dan suara">
            <div className="flex flex-col gap-4">
              <Field label="Teks berjalan" hint={`${runningText.length}/240 karakter. Kosongkan untuk menyembunyikan.`}>
                <textarea
                  name="runningText"
                  rows={2}
                  maxLength={240}
                  value={runningText}
                  onChange={(event) => setRunningText(event.target.value)}
                  className={cn(inputClass, "py-3")}
                />
              </Field>
              <Switch
                name="voiceEnabled"
                label="Suara panggilan"
                description="Lonceng dan pengumuman nomor dibacakan di TV."
                defaultChecked={settings.voiceEnabled}
              />
            </div>
          </Panel>

          <Panel title="Aturan loket">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Batas panggil ulang" hint="Setelah batas ini petugas menandai Tidak hadir.">
                <input name="maxRecall" type="number" min={0} max={20} required defaultValue={settings.maxRecall} className={inputClass} />
              </Field>
              <Field label="Target lama penanganan (menit)" hint="Lewat dari ini, timer dan dasbor berubah oranye.">
                <input
                  name="targetServiceMinutes"
                  type="number"
                  min={1}
                  max={240}
                  required
                  defaultValue={settings.targetServiceMinutes}
                  className={inputClass}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Tiket cetak">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
              <Field label="Teks kaki tiket">
                <input
                  name="ticketFooter"
                  maxLength={240}
                  value={footer}
                  onChange={(event) => setFooter(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Lebar kertas">
                <select
                  name="ticketWidthMm"
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value) === 58 ? 58 : 80)}
                  className={inputClass}
                >
                  <option value={80}>80 mm</option>
                  <option value={58}>58 mm</option>
                </select>
              </Field>
            </div>
          </Panel>

          <Panel title="Kiosk, TV, dan tampilan">
            <div className="flex flex-col gap-3 text-sm sm:flex-row">
              <Link href="/admin/devices" className="flex flex-1 items-center gap-3 rounded-xl border border-line p-3 font-bold text-brand-navy hover:bg-navy-soft">
                <Icon name="tv" />
                <span className="flex-1">Pasang kiosk dan TV di menu Perangkat</span>
                <Icon name="arrowRight" className="size-4" />
              </Link>
              <Link href="/admin/branding" className="flex flex-1 items-center gap-3 rounded-xl border border-line p-3 font-bold text-brand-navy hover:bg-navy-soft">
                <Icon name="layers" />
                <span className="flex-1">Nama lembaga, logo, dan warna</span>
                <Icon name="arrowRight" className="size-4" />
              </Link>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <Panel title="Pratinjau tiket" bodyClassName="flex justify-center bg-surface">
            <TicketPreview footer={footer} widthMm={width} />
          </Panel>
          <BrandButton type="submit" size="lg" disabled={pending}>
            <Icon name="check" />
            {pending ? "Menyimpan…" : "Simpan pengaturan"}
          </BrandButton>
        </div>
      </form>
      {dialog}
    </section>
  );
}

function TicketPreview({ footer, widthMm }: { footer: string; widthMm: number }) {
  return (
    <div
      className="rounded-sm bg-brand-white px-4 py-5 text-center text-ink shadow-card"
      style={{ width: widthMm === 58 ? 180 : 240 }}
      aria-label="Contoh tiket"
    >
      <BrandLogo className="mx-auto h-10 grayscale" />
      <p className="mt-3 text-[10px] font-bold tracking-widest">NOMOR ANTRIAN</p>
      <p className="mt-1 text-5xl font-bold leading-none tabular-nums">A012</p>
      <p className="mt-2 text-sm font-bold">Customer Service</p>
      <p className="mt-1 text-[10px]">Kamis, 8 Oktober 2026 09.15</p>
      <p className="mt-2 text-xs font-bold">3 antrian di depan Anda</p>
      <div className="my-3 border-t border-dashed border-brand-grey" />
      {footer ? <p className="text-[10px]">{footer}</p> : null}
      <p className="mt-2 text-[10px] text-ink-muted">Kertas {widthMm} mm</p>
    </div>
  );
}
