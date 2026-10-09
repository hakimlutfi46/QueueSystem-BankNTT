"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAdmin } from "@/app/admin/submit";
import { BrandButton } from "@/components/brand/brand-button";
import { Field, Switch, inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Alert, PageHeader, Panel } from "@/components/ui/panel";
import type { AdminSettings } from "@/lib/admin/settings";
import { cn } from "@/lib/cn";

export function SettingsScreen({
  settings,
  deviceLinks,
}: {
  settings: AdminSettings;
  deviceLinks: { kiosk: string | null; display: string | null };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [branchName, setBranchName] = useState(settings.branchName);
  const [footer, setFooter] = useState(settings.ticketFooter);
  const [width, setWidth] = useState(settings.ticketWidthMm);
  const [runningText, setRunningText] = useState(settings.runningText);

  async function save(formData: FormData) {
    setPending(true);
    const message = await submitAdmin("/api/admin/settings", "PUT", {
      branchName: String(formData.get("branchName") ?? ""),
      runningText: String(formData.get("runningText") ?? ""),
      voiceEnabled: formData.get("voiceEnabled") === "on",
      maxRecall: Number(formData.get("maxRecall") ?? 0),
      targetServiceMinutes: Number(formData.get("targetServiceMinutes") ?? 0),
      ticketFooter: String(formData.get("ticketFooter") ?? ""),
      ticketWidthMm: Number(formData.get("ticketWidthMm") ?? 80),
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

          <DevicePanel links={deviceLinks} />
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <Panel title="Pratinjau tiket" bodyClassName="flex justify-center bg-surface">
            <TicketPreview branchName={branchName} footer={footer} widthMm={width} />
          </Panel>
          <BrandButton type="submit" size="lg" disabled={pending}>
            <Icon name="check" />
            {pending ? "Menyimpan…" : "Simpan pengaturan"}
          </BrandButton>
        </div>
      </form>
    </section>
  );
}

function TicketPreview({ branchName, footer, widthMm }: { branchName: string; footer: string; widthMm: number }) {
  return (
    <div
      className="rounded-sm bg-brand-white px-4 py-5 text-center text-ink shadow-card"
      style={{ width: widthMm === 58 ? 180 : 240 }}
      aria-label="Contoh tiket"
    >
      <p className="text-sm font-bold">{branchName || "Nama cabang"}</p>
      <p className="mt-3 text-[10px] font-bold tracking-widest">NOMOR ANTRIAN</p>
      <p className="mt-1 text-5xl font-bold leading-none tabular-nums">A012</p>
      <p className="mt-2 text-sm font-bold">Customer Service</p>
      <p className="mt-1 text-[10px]">Kamis, 8 Oktober 2026 09.15</p>
      <p className="mt-2 text-xs font-bold">3 antrian di depan Anda</p>
      <div className="my-3 border-t border-dashed border-brand-grey" />
      {footer ? <p className="text-[10px]">{footer}</p> : null}
      <p className="text-[10px]">melayani lebih sungguh</p>
      <p className="mt-2 text-[10px] text-ink-muted">Kertas {widthMm} mm</p>
    </div>
  );
}

function DevicePanel({ links }: { links: { kiosk: string | null; display: string | null } }) {
  return (
    <Panel
      title="Pasang kiosk dan TV"
      description="Buka tautan ini sekali di perangkatnya. Browser menyimpan izinnya, lalu token hilang dari alamat."
    >
      <div className="flex flex-col gap-3">
        <DeviceLink icon="touch" label="Kiosk tiket" href={links.kiosk} />
        <DeviceLink icon="tv" label="Layar TV" href={links.display} />
        <p className="text-xs text-ink-muted">
          Jangan bagikan tautan ini ke luar cabang. Bila bocor, ganti KIOSK_TOKEN atau DISPLAY_TOKEN di server lalu buka ulang di perangkat.
        </p>
      </div>
    </Panel>
  );
}

function DeviceLink({ icon, label, href }: { icon: "touch" | "tv"; label: string; href: string | null }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-navy-soft text-brand-navy">
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{label}</p>
        <p className="truncate font-mono text-xs text-ink-muted">
          {href ? (shown ? href : href.replace(/token=.*/, "token=••••••••")) : "Token belum diatur di server."}
        </p>
      </div>
      {href ? (
        <div className="flex gap-2">
          <BrandButton size="sm" variant="ghost" onClick={() => setShown((value) => !value)}>
            {shown ? "Sembunyikan" : "Lihat"}
          </BrandButton>
          <BrandButton
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(href).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            <Icon name={copied ? "check" : "copy"} className="size-4" />
            {copied ? "Tersalin" : "Salin"}
          </BrandButton>
        </div>
      ) : null}
    </div>
  );
}
