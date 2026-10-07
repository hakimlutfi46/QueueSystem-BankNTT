import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <section className="max-w-lg rounded-[var(--radius-card)] bg-brand-white p-8 text-center">
        <h1 className="text-2xl font-bold text-brand-navy">Halaman tidak ditemukan</h1>
        <p className="mt-3">Alamat ini tidak ada di sistem antrian.</p>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center font-bold text-brand-blue">
          Kembali ke beranda
        </Link>
      </section>
    </main>
  );
}
