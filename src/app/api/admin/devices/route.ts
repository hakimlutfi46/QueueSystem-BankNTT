import { createDevice, listDevices } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runAdmin(async () => ({ devices: await listDevices(getPrisma()) }));
}

/** Daftarkan kiosk atau TV. Token di jawaban hanya muncul sekali. */
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => createDevice(getPrisma(), body));
}
