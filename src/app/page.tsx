import Link from "next/link";
import { BrandHeader } from "@/components/brand/brand-header";
import { Icon, type IconName } from "@/components/ui/icon";

const screens: { href: string; title: string; description: string; icon: IconName; who: string }[] = [
  {
    href: "/counter",
    title: "Loket petugas",
    description: "Masuk, pilih loket, lalu panggil nomor berikutnya.",
    icon: "desk",
    who: "Petugas CS dan teller",
  },
  {
    href: "/admin",
    title: "Admin",
    description: "Atur loket, layanan, petugas, pengaturan, dan laporan.",
    icon: "settings",
    who: "Admin atau supervisor",
  },
  {
    href: "/display",
    title: "Layar TV",
    description: "Tampilan ruang tunggu dengan suara panggilan.",
    icon: "tv",
    who: "Dibuka sekali dengan token perangkat",
  },
  {
    href: "/kiosk",
    title: "Kiosk tiket",
    description: "Nasabah memilih layanan dan tiket tercetak.",
    icon: "touch",
    who: "Dibuka sekali dengan token perangkat",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-surface">
      <BrandHeader branchName="Bank NTT" />
      <section className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-bold text-brand-navy">Sistem Antrian</h1>
        <p className="mt-2 text-ink-muted">Aplikasi cabang siap dijalankan.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {screens.map((screen) => (
            <li key={screen.href}>
              <Link
                href={screen.href}
                className="group flex h-full items-start gap-4 rounded-[var(--radius-card)] border border-line bg-brand-white p-5 shadow-card transition-shadow hover:shadow-glow"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-brand-white">
                  <Icon name={screen.icon} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-lg font-bold text-brand-navy">
                    {screen.title}
                    <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                  <span className="mt-1 block text-ink">{screen.description}</span>
                  <span className="mt-2 block text-xs text-ink-muted">{screen.who}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-ink-muted">
          <Link href="/styleguide" className="font-bold text-brand-blue">Panduan tampilan</Link>
          {" · "}token warna dan komponen merek.
        </p>
      </section>
    </main>
  );
}
