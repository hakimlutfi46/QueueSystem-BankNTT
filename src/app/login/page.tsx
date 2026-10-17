import { redirect } from "next/navigation";
import { BrandLogo, BrandTagline } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { Icon, type IconName } from "@/components/ui/icon";
import { logout } from "@/app/counter/actions";
import { LoginForm } from "@/app/login/login-form";
import { BrandButton } from "@/components/brand/brand-button";
import { readSettings } from "@/lib/admin/settings";
import { currentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const highlights: { icon: IconName; text: string }[] = [
  { icon: "megaphone", text: "Panggil nomor berikutnya dengan satu tombol atau tombol Spasi" },
  { icon: "tv", text: "Nomor langsung tampil dan dibacakan di layar TV" },
  { icon: "chart", text: "Laporan harian dan rekap siap diunduh" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await currentUser();
  const params = await searchParams;
  // Tanpa tujuan, admin diarahkan ke panel admin dan petugas ke layar loket setelah masuk.
  const callbackUrl =
    params.callbackUrl?.startsWith("/") && !params.callbackUrl.startsWith("//") ? params.callbackUrl : "";
  // Sudah masuk dan tujuannya bisa dibuka akun ini: langsung ke sana. Bila /login dibuka langsung, atau
  // petugas membuka halaman admin, tampilkan siapa yang sedang masuk supaya bisa berganti akun.
  const blockedAdmin = user != null && user.role !== "ADMIN" && callbackUrl.startsWith("/admin");
  if (user && callbackUrl && !blockedAdmin) redirect(callbackUrl);
  const { branchName } = await readSettings(getPrisma());
  const forAdmin = callbackUrl.startsWith("/admin");
  const forCounter = callbackUrl.startsWith("/counter");

  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-deep p-12 text-brand-white lg:flex">
        <div
          className="absolute inset-y-0 right-0 w-5 bg-brand-orange"
          style={{ clipPath: "polygon(45% 0, 100% 0, 55% 100%, 0 100%)" }}
          aria-hidden="true"
        />
        <div className="inline-flex w-fit rounded-xl bg-brand-white px-5 py-3">
          <BrandLogo variant="color" priority className="h-16" />
        </div>
        <div className="max-w-lg">
          <p className="text-lg font-bold opacity-80">{branchName}</p>
          <h2 className="mt-2 text-5xl font-bold leading-tight">Sistem Antrian Customer Service dan Teller</h2>
          <ul className="mt-8 flex flex-col gap-4">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-center gap-4 text-lg">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy">
                  <Icon name={item.icon} />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <BrandTagline className="mb-3 font-bold" />
          <DiagonalStripes className="-mx-12" />
        </div>
      </section>

      <section className="flex flex-col">
        <div className="bg-brand-navy px-6 py-4 lg:hidden">
          <div className="inline-flex rounded-lg bg-brand-white px-3 py-2">
            <BrandLogo variant="color" priority className="h-10" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <span className="flex size-12 items-center justify-center rounded-xl bg-navy-soft text-brand-navy">
              <Icon name={forAdmin ? "settings" : forCounter ? "desk" : "user"} className="size-6" />
            </span>
            <h1 className="mt-5 text-3xl font-bold text-brand-navy">
              {forAdmin ? "Masuk admin" : forCounter ? "Masuk loket" : "Masuk"}
            </h1>
            <p className="mb-8 mt-2 text-ink-muted">
              {forAdmin
                ? "Kelola loket, layanan, petugas, dan laporan cabang."
                : forCounter
                  ? "Masuk dengan akun petugas, lalu pilih loket tempat Anda bertugas."
                  : "Akun admin masuk ke panel admin, akun petugas langsung ke layar loket."}
            </p>
            {user ? (
              <SignedInCard name={user.name} admin={user.role === "ADMIN"} blockedAdmin={blockedAdmin} />
            ) : (
              <LoginForm callbackUrl={callbackUrl} />
            )}
            <p className="mt-8 text-center text-xs text-ink-muted">
              Lupa kata sandi? Minta admin cabang menggantinya dari menu Petugas.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

/** Akun yang sedang masuk, dengan pilihan lanjut ke halamannya atau keluar untuk berganti akun. */
function SignedInCard({ name, admin, blockedAdmin }: { name: string; admin: boolean; blockedAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-brand-white p-5 shadow-card">
      <p className="text-ink">
        Anda sudah masuk sebagai <strong>{name}</strong> ({admin ? "admin" : "petugas"}).
      </p>
      {blockedAdmin ? (
        <p className="rounded-xl bg-orange-soft px-4 py-3 text-sm font-bold text-ink">
          Halaman admin hanya untuk akun admin. Keluar dulu, lalu masuk dengan akun admin.
        </p>
      ) : null}
      <BrandButton href={admin ? "/admin" : "/counter"} size="lg" variant={blockedAdmin ? "outline" : "primary"}>
        {admin ? "Lanjut ke panel admin" : "Lanjut ke layar loket"}
        <Icon name="arrowRight" />
      </BrandButton>
      <form action={logout}>
        <BrandButton type="submit" variant={blockedAdmin ? "primary" : "outline"} className="w-full">
          <Icon name="logout" />
          Keluar dan masuk dengan akun lain
        </BrandButton>
      </form>
    </div>
  );
}
