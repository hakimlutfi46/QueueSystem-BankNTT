import { ServicesScreen } from "@/app/admin/services/services-screen";
import { listCounters } from "@/lib/admin/counters";
import { listServices } from "@/lib/admin/services";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const db = getPrisma();
  const [services, counters] = await Promise.all([listServices(db), listCounters(db)]);
  return <ServicesScreen services={services} counters={counters} />;
}
