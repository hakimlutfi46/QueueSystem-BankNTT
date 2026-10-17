import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminNav } from "@/app/admin/admin-nav";
import { readSettings } from "@/lib/admin/settings";
import { changePasswordUrl, currentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=/admin");
  // Petugas yang membuka halaman admin diarahkan ke halaman masuk, yang menjelaskan cara berganti ke akun admin.
  if (user.role !== "ADMIN") redirect("/login?callbackUrl=/admin");
  if (user.mustChangePassword) redirect(changePasswordUrl("/admin"));
  const settings = await readSettings(getPrisma());

  return (
    <div className="min-h-screen bg-surface text-ink lg:flex">
      <AdminNav name={user.name} branchName={settings.branchName} />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">
        <div className="mx-auto max-w-7xl">{children}</div>
      </div>
    </div>
  );
}
