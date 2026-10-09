import { readBranding, saveBranding } from "@/lib/branding";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runAdmin(async () => ({ branding: await readBranding(getPrisma()) }));
}

export async function PUT(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => ({ branding: await saveBranding(getPrisma(), body) }));
}
