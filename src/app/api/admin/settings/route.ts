import { readSettings, saveSettings } from "@/lib/admin/settings";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runAdmin(async () => ({ settings: await readSettings(getPrisma()) }));
}

export async function PUT(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => ({ settings: await saveSettings(getPrisma(), body) }));
}
