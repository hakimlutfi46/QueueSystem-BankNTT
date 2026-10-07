import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminNav } from "@/app/admin/admin-nav";
import { currentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=/admin");
  if (user.role !== "ADMIN") redirect("/counter");

  return (
    <div className="flex min-h-screen bg-surface text-ink">
      <AdminNav name={user.name} />
      <div className="min-w-0 flex-1 p-6">{children}</div>
    </div>
  );
}
