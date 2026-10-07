import { redirect } from "next/navigation";
import { BrandHeader } from "@/components/brand/brand-header";
import { auth } from "@/auth";
import { LoginForm } from "@/app/login/login-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl =
    params.callbackUrl?.startsWith("/") && !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/counter";
  if (session?.user) redirect(callbackUrl);

  return (
    <main className="min-h-screen bg-surface">
      <BrandHeader branchName="Bank NTT" />
      <section className="px-4 py-10">
        <h1 className="mb-6 text-center text-2xl font-bold text-brand-navy">Masuk loket</h1>
        <LoginForm callbackUrl={callbackUrl} />
      </section>
    </main>
  );
}
