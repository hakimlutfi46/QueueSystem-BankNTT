"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <section className="max-w-lg rounded-[var(--radius-card)] bg-brand-white p-8 text-center">
        <h1 className="text-2xl font-bold text-brand-navy">Terjadi gangguan</h1>
        <p className="mt-3">Muat ulang halaman. Jika masih gagal, hubungi petugas.</p>
        <button type="button" className="mt-6 min-h-12 rounded-[var(--radius-card)] bg-brand-navy px-5 font-bold text-brand-white" onClick={() => reset()}>
          Muat ulang
        </button>
      </section>
    </main>
  );
}
