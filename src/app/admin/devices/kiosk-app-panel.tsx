"use client";

import { useEffect, useState } from "react";
import { requestAdmin } from "@/app/admin/submit";
import { BrandButton } from "@/components/brand/brand-button";
import { Badge } from "@/components/ui/badge";
import { Field, inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal, Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import type { KioskAppOverview } from "@/lib/kiosk/overview";

export const INSTALLER_URL = "/api/admin/devices/installer";
const ICON_URL = "/api/admin/kiosk-app/icon";
const DEFAULT_ICON = "/brand/kiosk-app-icon.png";
const NAME_PATTERN = "[A-Za-z0-9][A-Za-z0-9 ._\\-]{1,39}";
const ICON_SIZE = 512;
const POLL_MS = 3_000;

/**
 * Panel aplikasi kiosk Windows: nama dan ikon aplikasi, build ulang installer di server, dan unduhan .exe.
 * Selama build berjalan, status diminta ulang tiap beberapa detik.
 */
export function KioskAppPanel({
  app,
  onChange,
}: {
  app: KioskAppOverview;
  onChange: (next: KioskAppOverview) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const running = app.build.state === "running";
  const outdated = app.installer != null && app.installer.appName !== app.settings.name;
  const iconSrc = app.settings.iconVersion ? `${ICON_URL}?v=${app.settings.iconVersion}` : DEFAULT_ICON;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(async () => {
      const result = await requestAdmin<KioskAppOverview>("/api/admin/kiosk-app", "GET", undefined);
      if (result.data) onChange(result.data);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, onChange]);

  async function build() {
    setStarting(true);
    const result = await requestAdmin<KioskAppOverview>("/api/admin/kiosk-app/build", "POST", {});
    setStarting(false);
    setError(result.error);
    if (result.data) onChange(result.data);
  }

  return (
    <Panel title="Aplikasi kiosk Windows">
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- ikon unggahan dilayani route admin */}
          <img src={iconSrc} alt="" className="size-14 shrink-0 rounded-xl border border-line bg-brand-white object-contain p-1" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-brand-navy" data-testid="kiosk-app-name">{app.settings.name}</p>
            <p className="text-xs text-ink-muted">Layar penuh terkunci, menyala otomatis, cetak tiket tanpa dialog.</p>
          </div>
          <BrandButton size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={running} ariaLabel="Ubah nama dan ikon aplikasi">
            <Icon name="edit" className="size-4" />
            Ubah
          </BrandButton>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 font-bold text-danger">{error}</p>
        ) : null}

        <BuildStatus app={app} />

        {app.installer && !running ? (
          <>
            <BrandButton href={INSTALLER_URL}>
              <Icon name="download" />
              Unduh installer (.exe)
            </BrandButton>
            <p className="text-xs text-ink-muted">
              {app.installer.fileName} · {formatSize(app.installer.size)} · dibuat {formatDate(app.installer.builtAt)}
            </p>
            {outdated ? (
              <p className="rounded-xl bg-orange-soft px-3 py-2 text-xs font-bold text-ink">
                Installer ini belum memakai nama atau ikon terbaru. Tekan Build ulang supaya ikut berubah.
              </p>
            ) : null}
          </>
        ) : null}

        {app.buildAvailable ? (
          <BrandButton
            variant={app.installer && !outdated ? "outline" : "primary"}
            onClick={() => void build()}
            disabled={running || starting}
          >
            <Icon name="repeat" className={cn("size-4", running ? "animate-spin" : null)} />
            {running ? "Sedang membuat installer…" : app.installer ? "Build ulang installer" : "Build installer"}
          </BrandButton>
        ) : (
          <p className="rounded-xl bg-surface px-3 py-2 text-xs text-ink-muted">
            Server ini tidak memuat folder <span className="font-mono">apps/kiosk-desktop</span>, jadi installer tidak bisa dibuat dari
            sini. Jalankan <span className="font-mono">npm run kiosk:build</span> di komputer yang memuat kode lengkap, lalu salin isi
            folder <span className="font-mono">downloads/</span> ke server.
          </p>
        )}
        <p className="text-xs text-ink-muted">
          Satu installer untuk semua kiosk. Setelah terpasang, tekan Kode aplikasi pada kiosk yang terdaftar untuk memasangkannya.
        </p>
      </div>

      {editing ? (
        <KioskAppModal
          app={app}
          iconSrc={iconSrc}
          onClose={() => setEditing(false)}
          onSaved={(next, rebuild) => {
            onChange(next);
            setEditing(false);
            if (rebuild) void build();
          }}
        />
      ) : null}
    </Panel>
  );
}

function BuildStatus({ app }: { app: KioskAppOverview }) {
  const { build } = app;
  if (build.state === "running") {
    return (
      <div className="rounded-xl bg-navy-soft px-3 py-3" role="status" data-testid="kiosk-build-status">
        <p className="flex items-center gap-2 font-bold text-brand-navy">
          <span className="size-4 animate-spin rounded-full border-2 border-brand-navy/30 border-t-brand-navy" aria-hidden="true" />
          Membuat installer &quot;{build.appName}&quot;
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Biasanya 1–3 menit. Build pertama mengunduh Electron (sekitar 100 MB) sehingga perlu internet. Halaman ini boleh ditinggal.
        </p>
        {build.log.length > 0 ? (
          <p className="mt-2 truncate font-mono text-xs text-ink-muted">{build.log[build.log.length - 1]}</p>
        ) : null}
      </div>
    );
  }
  if (build.state === "failed") {
    return (
      <details className="rounded-xl bg-danger-soft px-3 py-3 text-danger" data-testid="kiosk-build-status" open>
        <summary className="cursor-pointer font-bold">Build gagal: {build.error ?? "lihat catatan"}</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-ink">{build.log.slice(-15).join("\n")}</pre>
      </details>
    );
  }
  if (build.state === "done") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 font-bold text-success" role="status" data-testid="kiosk-build-status">
        <Icon name="check" className="size-4" />
        Installer &quot;{build.appName}&quot; selesai dibuat.
      </p>
    );
  }
  return app.installer ? null : <Badge tone="orange" dot>Installer belum dibuat</Badge>;
}

function KioskAppModal({
  app,
  iconSrc,
  onClose,
  onSaved,
}: {
  app: KioskAppOverview;
  iconSrc: string;
  onClose: () => void;
  onSaved: (next: KioskAppOverview, rebuild: boolean) => void;
}) {
  const [name, setName] = useState(app.settings.name);
  const [icon, setIcon] = useState<{ choice: "keep" | "default" | "upload"; dataUrl: string | null }>({
    choice: "keep",
    dataUrl: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const preview = icon.choice === "upload" ? icon.dataUrl : icon.choice === "default" ? DEFAULT_ICON : iconSrc;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setIcon({ choice: "upload", dataUrl: await squarePng(file) });
    } catch {
      setError("Gambar tidak bisa dibaca. Pakai PNG, JPG, WebP, atau SVG.");
    }
  }

  async function save(rebuild: boolean) {
    setSaving(true);
    const result = await requestAdmin<KioskAppOverview>("/api/admin/kiosk-app", "PUT", {
      name,
      ...(icon.choice === "default" ? { icon: "default" } : icon.choice === "upload" && icon.dataUrl ? { icon: icon.dataUrl } : {}),
    });
    setSaving(false);
    setError(result.error);
    if (result.data) onSaved(result.data, rebuild && app.buildAvailable);
  }

  return (
    <Modal title="Nama dan ikon aplikasi" description="Dipakai untuk installer, ikon di desktop dan taskbar, serta layar pemasangan." onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save(true);
        }}
      >
        <Field label="Nama aplikasi" hint="2–40 karakter: huruf, angka, spasi, titik, strip, atau garis bawah">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            pattern={NAME_PATTERN}
            maxLength={40}
            className={inputClass}
          />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-bold">Ikon aplikasi</p>
          <div className="flex items-center gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- pratinjau data URL lokal
              <img src={preview} alt="Pratinjau ikon" className="size-20 shrink-0 rounded-2xl border border-line bg-brand-white object-contain p-1" />
            ) : null}
            <div className="flex flex-col items-start gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-card)] border border-line px-3 py-2 text-sm font-bold text-brand-navy hover:border-brand-blue hover:bg-navy-soft">
                <Icon name="plus" className="size-4" />
                Unggah gambar
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(event) => void pick(event.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => setIcon({ choice: "default", dataUrl: null })}
                className="text-sm font-bold text-brand-blue hover:underline"
              >
                Pakai logo Bank NTT (bawaan)
              </button>
              <p className="text-xs text-ink-muted">Gambar dibuat persegi otomatis. Paling bagus simbol logo tanpa tulisan.</p>
            </div>
          </div>
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">{error}</p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <BrandButton variant="ghost" onClick={onClose}>
            Batal
          </BrandButton>
          <BrandButton variant="outline" disabled={saving || (icon.choice === "upload" && !icon.dataUrl)} onClick={() => void save(false)}>
            Simpan saja
          </BrandButton>
          {app.buildAvailable ? (
            <BrandButton type="submit" disabled={saving || (icon.choice === "upload" && !icon.dataUrl)}>
              <Icon name="repeat" className="size-4" />
              Simpan &amp; build ulang
            </BrandButton>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

/** Gambar apa pun menjadi PNG persegi 512 px dengan latar transparan, gambar di tengah tanpa terpotong. */
async function squarePng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || ICON_SIZE;
    const height = image.naturalHeight || ICON_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    const scale = Math.min(ICON_SIZE / width, ICON_SIZE / height) * 0.92;
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, (ICON_SIZE - drawWidth) / 2, (ICON_SIZE - drawHeight) / 2, drawWidth, drawHeight);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
