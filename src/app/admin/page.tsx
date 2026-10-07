import { Dashboard } from "@/app/admin/dashboard";
import { loadDaySummary } from "@/lib/admin/summary";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const summary = await loadDaySummary(getPrisma());
  return <Dashboard initial={summary} />;
}
