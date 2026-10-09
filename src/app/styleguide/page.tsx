import type { Metadata } from "next";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandCard } from "@/components/brand/brand-card";
import { BrandHeader } from "@/components/brand/brand-header";
import { BrandLogo } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { QueueNumber } from "@/components/brand/queue-number";
import { TokenSwatches } from "@/components/brand/token-swatch";
import { Badge, CounterStatusBadge, PrefixTile } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/panel";

export const metadata: Metadata = {
  title: "Panduan tampilan",
};

export default function StyleguidePage() {
  return (
    <main>
      <BrandHeader branchName="Bank NTT" trailing={<span className="text-sm">Panduan tampilan</span>} />
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-8">
        <section className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold text-brand-navy">Panduan tampilan</h1>
          <p className="max-w-3xl text-base">
            Token, motif, dan komponen merek yang dipakai seluruh layar.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Warna</h2>
          <TokenSwatches />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Logo</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <BrandCard>
              <p className="mb-4 text-sm text-ink-muted">Latar terang</p>
              <BrandLogo variant="color" />
              <p className="mt-3 font-bold">melayani lebih sungguh</p>
            </BrandCard>
            <div className="rounded-[var(--radius-card)] bg-brand-deep p-6">
              <p className="mb-4 text-sm text-brand-white">Latar biru</p>
              <BrandLogo variant="onBlue" />
              <p className="mt-3 font-bold text-brand-white">melayani lebih sungguh</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Header dan garis miring</h2>
          <BrandCard className="overflow-hidden p-0">
            <BrandHeader branchName="Kantor cabang" />
          </BrandCard>
          <DiagonalStripes />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Tombol</h2>
          <div className="flex flex-wrap gap-4">
            <BrandButton>Utama</BrandButton>
            <BrandButton variant="secondary">Sekunder</BrandButton>
          </div>
          <BrandButton size="touch" className="w-full">
            Customer Service
          </BrandButton>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Kartu</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <BrandCard>
              <h3 className="text-xl font-bold text-brand-navy">Kartu biasa</h3>
              <p className="mt-2 text-ink-muted">Permukaan putih, sudut 16 px, bayangan tipis.</p>
            </BrandCard>
            <BrandCard active>
              <h3 className="text-xl font-bold text-brand-navy">Kartu aktif</h3>
              <p className="mt-2 text-ink-muted">Cahaya biru di tepi untuk keadaan yang sedang dipilih.</p>
            </BrandCard>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Nomor antrian</h2>
          <BrandCard>
            <p className="mb-2 text-sm text-ink-muted">Layar petugas, 96 px</p>
            <QueueNumber value="A012" size="counter" />
          </BrandCard>
          <div className="overflow-x-auto rounded-[var(--radius-card)] bg-brand-deep p-6">
            <p className="mb-2 text-sm text-brand-white">Layar TV, 220 px</p>
            <QueueNumber value="A012" size="tv" tone="orange" />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Tipografi</h2>
          <BrandCard className="flex flex-col gap-3">
            <p className="text-[40px] font-bold text-brand-navy">Label tombol kiosk</p>
            <p className="text-base">Teks isi 16 px, Arial.</p>
            <p className="text-sm text-ink-muted">Teks sekunder memakai ink-muted.</p>
          </BrandCard>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Kontras</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <p className="rounded-[var(--radius-card)] bg-brand-deep p-4 font-bold text-brand-white">
              Putih di atas brand-deep
            </p>
            <p className="rounded-[var(--radius-card)] bg-brand-navy p-4 font-bold text-brand-white">
              Putih di atas brand-navy
            </p>
            <p className="rounded-[var(--radius-card)] bg-brand-blue p-4 font-bold text-brand-white">
              Putih di atas brand-blue
            </p>
            <p className="rounded-[var(--radius-card)] bg-brand-sky p-4 text-2xl font-bold text-brand-white">
              Putih tebal 24 px di atas brand-sky
            </p>
            <p className="rounded-[var(--radius-card)] bg-brand-orange p-4 font-bold text-ink">
              Ink di atas brand-orange
            </p>
            <p className="rounded-[var(--radius-card)] bg-brand-deep p-4 text-5xl font-bold text-brand-orange tabular-nums">
              A012
            </p>
            <p className="rounded-[var(--radius-card)] border-4 border-brand-grey bg-brand-white p-4 text-ink-muted">
              Garis abu-abu, teks kecil ink-muted
            </p>
            <p className="rounded-[var(--radius-card)] bg-brand-white p-4">
              <span className="font-bold text-success">Selesai</span>
              <span className="mx-3 text-brand-grey">|</span>
              <span className="font-bold text-danger">Tidak hadir</span>
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Komponen antarmuka</h2>
          <BrandCard className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <BrandButton variant="outline">Garis tepi</BrandButton>
              <BrandButton variant="ghost">Tanpa latar</BrandButton>
              <BrandButton variant="danger">Bahaya</BrandButton>
              <BrandButton variant="accent">Aksen</BrandButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CounterStatusBadge status="OPEN" />
              <CounterStatusBadge status="PAUSED" />
              <CounterStatusBadge status="CLOSED" />
              <CounterStatusBadge status="OPEN" inactive />
              <Badge tone="sky">A · Customer Service</Badge>
              <PrefixTile prefix="A" />
              <PrefixTile prefix="B" />
            </div>
          </BrandCard>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total tiket" value={128} icon="ticket" />
            <StatCard label="Menunggu" value={7} icon="clock" tone="orange" />
            <StatCard label="Selesai" value={112} icon="check" tone="success" />
            <StatCard label="Tidak hadir" value={4} icon="userX" tone="danger" />
          </div>
        </section>
      </div>
    </main>
  );
}
