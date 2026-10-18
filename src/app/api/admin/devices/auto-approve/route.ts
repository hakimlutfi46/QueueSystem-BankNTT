import { AdminError } from "@/lib/admin/errors";
import { setAutoApprove } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nyalakan atau matikan "Terima perangkat baru otomatis". Berlaku sampai admin mematikannya lagi. */
export async function PUT(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  return runAdmin(async () => {
    if (typeof body?.enabled !== "boolean") throw new AdminError("VALIDATION", "Data tidak valid.");
    return { enabled: await setAutoApprove(getPrisma(), body.enabled) };
  });
}
