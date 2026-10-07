import { createService, listServices } from "@/lib/admin/services";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runAdmin(async () => ({ services: await listServices(getPrisma()) }));
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => ({ service: await createService(getPrisma(), body) }));
}
