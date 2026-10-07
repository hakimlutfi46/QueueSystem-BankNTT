import { CountersScreen } from "@/app/admin/counters/counters-screen";
import { listCounters } from "@/lib/admin/counters";
import { listServices } from "@/lib/admin/services";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CountersPage() {
  const db = getPrisma();
  const [counters, services] = await Promise.all([listCounters(db), listServices(db)]);
  return <CountersScreen counters={counters} services={services} />;
}
