export default function DeviceRequiredPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <section className="max-w-lg rounded-[var(--radius-card)] bg-brand-white p-8 text-center">
        <h1 className="text-2xl font-bold text-brand-navy">Perangkat belum diizinkan</h1>
        <p className="mt-3">Buka tautan kiosk atau TV yang diberikan petugas, sekali saja.</p>
      </section>
    </main>
  );
}
