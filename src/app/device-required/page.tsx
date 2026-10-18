import { RetryAfter } from "./retry";

type State = "pending" | "revoked" | "unknown" | "limited";

const MESSAGES: Record<State, { title: string; body: string; retrySeconds: number | null }> = {
  pending: {
    title: "Menunggu persetujuan admin",
    body: "Perangkat ini sudah terdaftar. Minta admin membuka Admin → Perangkat lalu menekan Setujui. Layar terbuka sendiri setelah disetujui.",
    retrySeconds: 5,
  },
  revoked: {
    title: "Perangkat dicabut",
    body: "Izin perangkat ini dicabut admin. Minta admin menekan Aktifkan lagi di Admin → Perangkat.",
    retrySeconds: null,
  },
  unknown: {
    title: "Perangkat tidak dikenal",
    body: "Server tidak mengenali perangkat ini, misalnya karena database diatur ulang. Aplikasi kiosk dan TV mendaftar ulang sendiri; di browser, buka lagi halaman ini.",
    retrySeconds: 30,
  },
  limited: {
    title: "Terlalu banyak perangkat baru",
    body: "Terlalu banyak perangkat mendaftar atau menunggu persetujuan. Minta admin menyetujui atau mencabut perangkat di Admin → Perangkat. Mencoba lagi sebentar lagi.",
    retrySeconds: 30,
  },
};

export default async function DeviceRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; state?: string }>;
}) {
  const params = await searchParams;
  const kind = params.kind === "display" ? "display" : "kiosk";
  const state: State = params.state && params.state in MESSAGES ? (params.state as State) : "unknown";
  const message = MESSAGES[state];
  const href = kind === "display" ? "/display" : "/kiosk";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <section className="max-w-lg rounded-[var(--radius-card)] bg-brand-white p-8 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{kind === "display" ? "Layar TV" : "Kiosk tiket"}</p>
        <h1 className="mt-2 text-2xl font-bold text-brand-navy">{message.title}</h1>
        <p className="mt-3">{message.body}</p>
        {message.retrySeconds ? <RetryAfter href={href} seconds={message.retrySeconds} /> : null}
      </section>
    </main>
  );
}
