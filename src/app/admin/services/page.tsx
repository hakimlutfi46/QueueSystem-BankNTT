import { ServicesScreen } from "@/app/admin/services/services-screen";
import { listServices } from "@/lib/admin/services";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  return <ServicesScreen services={await listServices(getPrisma())} />;
}
