import { redirect } from "next/navigation";
import { PasswordForm } from "@/app/account/password/password-form";
import { logout } from "@/app/counter/actions";
import { BrandButton } from "@/components/brand/brand-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { Icon } from "@/components/ui/icon";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { CHANGE_PASSWORD_PATH, currentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await currentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(CHANGE_PASSWORD_PATH)}`);
  const params = await searchParams;
  const home = user.role === "ADMIN" ? "/admin" : "/counter";
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : home;

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <div className="bg-brand-navy px-6 py-4">
        <div className="inline-flex rounded-lg bg-brand-white px-3 py-2">
          <BrandLogo variant="color" priority className="h-10" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <span className="flex size-12 items-center justify-center rounded-xl bg-navy-soft text-brand-navy">
            <Icon name="lock" className="size-6" />
          </span>
          <h1 className="mt-5 text-3xl font-bold text-brand-navy">Ganti kata sandi</h1>
          <p className="mb-6 mt-2 text-ink-muted">
            Masuk sebagai <strong className="text-ink">{user.name}</strong>.
          </p>
          {user.mustChangePassword ? (
            <p className="mb-6 flex items-start gap-2 rounded-xl bg-orange-soft px-4 py-3 text-sm font-bold text-ink" data-testid="password-required">
              <Icon name="lock" className="mt-0.5 size-4" />
              Kata sandi Anda masih bawaan, sementara dari admin, atau terlalu mudah ditebak. Ganti dulu sebelum melanjutkan.
            </p>
          ) : null}
          <PasswordForm next={next} minLength={MIN_PASSWORD_LENGTH} />
          <div className="mt-6 flex flex-wrap justify-between gap-2">
            {user.mustChangePassword ? (
              <span />
            ) : (
              <BrandButton href={next} variant="ghost">
                Batal
              </BrandButton>
            )}
            <form action={logout}>
              <BrandButton type="submit" variant="ghost">
                <Icon name="logout" className="size-4" />
                Keluar
              </BrandButton>
            </form>
          </div>
        </div>
      </div>
      <DiagonalStripes />
    </main>
  );
}
