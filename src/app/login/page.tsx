import { redirect } from "next/navigation";
import { BrandLogo, BrandTagline } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { Icon, type IconName } from "@/components/ui/icon";
import { LoginForm } from "@/app/login/login-form";
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
  if (user) {
    const home = user.role === "ADMIN" ? "/admin" : "/counter";
    redirect(!callbackUrl || (user.role !== "ADMIN" && callbackUrl.startsWith("/admin")) ? home : callbackUrl);
  }
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
            <LoginForm callbackUrl={callbackUrl} />
            <p className="mt-8 text-center text-xs text-ink-muted">
              Lupa kata sandi? Minta admin cabang menggantinya dari menu Petugas.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
