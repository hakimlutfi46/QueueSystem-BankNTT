"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { submitAdmin } from "@/app/admin/submit";
import { BrandButton } from "@/components/brand/brand-button";
import { useBranding } from "@/components/brand/branding-provider";
import { Badge } from "@/components/ui/badge";
import { Field, inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Alert, PageHeader, Panel } from "@/components/ui/panel";
import type { Branding } from "@/lib/branding";
import {
  BRAND_COLOR_KEYS,
  BRAND_COLOR_LABELS,
  checkContrast,
  HEX_COLOR,
  normalizeHex,
  type BrandColorKey,
} from "@/lib/branding-colors";
import { cn } from "@/lib/cn";

const MAX_LOGO_BYTES = 512 * 1024;

/** Warna bawaan dibaca dari tokens.css (--default-*), supaya kode tidak menyimpan nilai hex sendiri. */
function readDefaults(): string {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => normalizeHex(style.getPropertyValue(name));
  return JSON.stringify({
    ...Object.fromEntries(BRAND_COLOR_KEYS.map((key) => [key, read(`--default-${key}`)])),
    white: read("--brand-white"),
  });
}

const noSubscribe = () => () => undefined;

export function BrandingScreen({ branding }: { branding: Branding }) {
  const router = useRouter();
  const live = useBranding();
  const defaultsJson = useSyncExternalStore(noSubscribe, readDefaults, () => "");
  const defaults = useMemo(
    () => (defaultsJson ? (JSON.parse(defaultsJson) as Record<BrandColorKey | "white", string>) : null),
    [defaultsJson],
  );
  const [orgName, setOrgName] = useState(branding.orgName);
  const [tagline, setTagline] = useState(branding.tagline);
  const [picked, setPicked] = useState(branding.colors);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const colors = defaults
    ? (Object.fromEntries(BRAND_COLOR_KEYS.map((key) => [key, picked[key] ?? defaults[key]])) as Record<BrandColorKey, string>)
    : null;
  const contrast = colors && defaults ? checkContrast(colors, defaults.white) : [];
  const customized = BRAND_COLOR_KEYS.some((key) => picked[key] && defaults && picked[key] !== defaults[key]);

  function done(message: string | null, success: string): boolean {
    setError(message);
    setNotice(message ? null : success);
    if (!message) router.refresh();
    return !message;
  }

  async function save() {
    if (!defaults) return;
    setPending(true);
    const changed = Object.fromEntries(
      BRAND_COLOR_KEYS.flatMap((key) => (picked[key] && picked[key] !== defaults[key] ? [[key, picked[key]]] : [])),
    );
    const message = await submitAdmin("/api/admin/branding", "PUT", { orgName, tagline, colors: changed });
    setPending(false);
    done(message, "Identitas disimpan. Kiosk, TV, dan layar petugas ikut berubah.");
  }

  async function upload(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo paling besar 512 KB. Perkecil ukuran gambarnya dulu.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) {
      setError("Berkas logo tidak terbaca.");
      return;
    }
    done(await submitAdmin("/api/admin/branding/logo", "PUT", { dataUrl }), "Logo diganti.");
  }

  const previewStyle = colors
    ? (Object.fromEntries(BRAND_COLOR_KEYS.map((key) => [`--brand-${key}`, colors[key]])) as CSSProperties)
    : undefined;

  return (
    <section>
      <PageHeader
        title="Identitas & tampilan"
        description="Nama lembaga, slogan, logo, dan warna yang tampil di kiosk, TV, layar petugas, tiket, dan Admin. Pakai ini bila aplikasi dipasang untuk lembaga lain."
      />
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Lembaga">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama lembaga" hint="Dipakai di judul halaman, teks logo, dan bila nama cabang kosong.">
                <input value={orgName} onChange={(event) => setOrgName(event.target.value)} maxLength={80} className={inputClass} />
              </Field>
              <Field label="Slogan" hint="Tampil di bawah nama cabang dan di tiket. Kosongkan untuk menyembunyikan.">
                <input value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={80} className={inputClass} />
              </Field>
            </div>
          </Panel>

          <Panel title="Logo" description="PNG, JPG, WebP, atau SVG, paling besar 512 KB. Latar transparan paling rapi.">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex h-24 w-48 items-center justify-center rounded-xl border border-line bg-brand-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={live.logoSrc} alt={`Logo ${live.orgName}`} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-card)] bg-brand-navy px-5 font-bold text-brand-white hover:bg-brand-blue">
                  <Icon name="download" className="size-4 rotate-180" />
                  Unggah logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void upload(file);
                    }}
                  />
                </label>
                {branding.logoVersion ? (
                  <BrandButton
                    variant="outline"
                    onClick={async () => done(await submitAdmin("/api/admin/branding/logo", "DELETE", {}), "Logo kembali ke bawaan.")}
                  >
                    Pakai logo bawaan
                  </BrandButton>
                ) : (
                  <Badge tone="muted">Logo bawaan</Badge>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            title="Warna"
            description="Lima warna merek. Warna lain (teks, latar halaman, sukses, bahaya) tetap supaya tulisan selalu terbaca."
            actions={
              customized ? (
                <BrandButton size="sm" variant="ghost" onClick={() => setPicked({})}>
                  Kembali ke warna bawaan
                </BrandButton>
              ) : null
            }
          >
            {colors ? (
              <div className="flex flex-col gap-5">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {BRAND_COLOR_KEYS.map((key) => (
                    <li key={key} className="flex items-start gap-3 rounded-xl border border-line p-3">
                      <input
                        type="color"
                        aria-label={`Warna ${BRAND_COLOR_LABELS[key].label}`}
                        value={colors[key]}
                        onChange={(event) => setPicked((current) => ({ ...current, [key]: event.target.value }))}
                        className="size-12 shrink-0 cursor-pointer rounded-lg border border-line bg-brand-white p-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{BRAND_COLOR_LABELS[key].label}</p>
                        <p className="text-xs text-ink-muted">{BRAND_COLOR_LABELS[key].usage}</p>
                        <input
                        aria-label={`Kode warna ${BRAND_COLOR_LABELS[key].label}`}
                        defaultValue={colors[key]}
                        key={colors[key]}
                        maxLength={7}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (HEX_COLOR.test(value)) setPicked((current) => ({ ...current, [key]: value.toLowerCase() }));
                        }}
                          className="mt-2 min-h-9 w-28 rounded-lg border border-line bg-brand-white px-2 font-mono text-xs focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-sky-soft"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <div>
                  <p className="mb-2 text-sm font-bold">Keterbacaan</p>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {contrast.map((check) => (
                      <li key={check.pair} className="flex items-center gap-2">
                        <Icon name={check.ok ? "check" : "close"} className={cn("size-4", check.ok ? "text-success" : "text-danger")} />
                        <span className="flex-1">{check.pair}</span>
                        <span className={cn("tabular-nums", check.ok ? "text-ink-muted" : "font-bold text-danger")}>
                          {check.ratio.toFixed(1)}:1 (min {check.minimum}:1)
                        </span>
                      </li>
                    ))}
                  </ul>
                  {contrast.some((check) => !check.ok) ? (
                    <p className="mt-2 text-xs text-danger">
                      Ada pasangan yang sulit dibaca, terutama dari jarak jauh di TV. Pilih warna lebih gelap atau lebih terang.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Memuat warna…</p>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <Panel title="Pratinjau" bodyClassName="flex flex-col gap-3">
            <div style={previewStyle} className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center gap-3 bg-brand-navy px-4 py-3 text-brand-white">
                <span className="rounded-md bg-brand-white px-2 py-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={live.logoSrc} alt="" className="h-6 w-auto" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{orgName || "Nama lembaga"}</p>
                  {tagline ? <p className="truncate text-[10px]">{tagline}</p> : null}
                </div>
              </div>
              <div className="flex h-1.5">
                <span className="flex-1 bg-brand-navy" />
                <span className="flex-1 bg-brand-blue" />
                <span className="flex-1 bg-brand-sky" />
                <span className="flex-1 bg-brand-orange" />
              </div>
              <div className="flex flex-col gap-2 bg-brand-white p-4">
                <span className="flex items-center gap-3 rounded-lg bg-brand-navy px-3 py-3 font-bold text-brand-white">
                  <span className="flex size-8 items-center justify-center rounded-md bg-brand-white text-brand-navy">A</span>
                  Customer Service
                </span>
                <span className="rounded-lg bg-brand-blue px-3 py-2 text-center text-sm font-bold text-brand-white">Tombol sekunder</span>
              </div>
            </div>
            <div style={previewStyle} className="flex items-center justify-between rounded-xl bg-brand-deep px-5 py-4 text-brand-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest">Nomor antrian</p>
                <p className="text-4xl font-bold text-brand-orange tabular-nums">A012</p>
              </div>
              <span className="rounded-lg border-2 border-brand-white px-3 py-1 font-bold">CS 1</span>
            </div>
          </Panel>
          <BrandButton size="lg" onClick={() => void save()} disabled={pending || !orgName.trim() || !defaults}>
            <Icon name="check" />
            {pending ? "Menyimpan…" : "Simpan identitas"}
          </BrandButton>
        </div>
      </div>
    </section>
  );
}
