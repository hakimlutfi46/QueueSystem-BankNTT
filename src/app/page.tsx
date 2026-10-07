export default function Home() {
  return (
    <main>
      <h1>Sistem Antrian</h1>
      <p>Aplikasi cabang siap dijalankan.</p>
      <p>
        <a className="font-bold text-brand-blue" href="/kiosk">
          Kiosk tiket
        </a>
        {" · "}
        <a className="font-bold text-brand-blue" href="/styleguide">
          Panduan tampilan
        </a>
      </p>
    </main>
  );
}
