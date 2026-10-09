import { removeLogo, saveLogo } from "@/lib/branding";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unggah logo sebagai data URL. */
export async function PUT(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => ({ branding: await saveLogo(getPrisma(), body) }));
}

/** Kembali ke logo bawaan. */
export async function DELETE(): Promise<Response> {
  return runAdmin(async () => ({ branding: await removeLogo(getPrisma()) }));
}
