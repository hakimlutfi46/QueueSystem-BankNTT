import { setServiceCounters } from "@/lib/admin/services";
import { AdminError } from "@/lib/admin/errors";
import { getPrisma } from "@/lib/db";
import { resourceId, runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mengganti daftar loket yang melayani layanan ini. Isi: { counterIds: number[] }. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const serviceId = resourceId(id);
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => {
    if (serviceId == null) throw new AdminError("NOT_FOUND", "Layanan tidak ditemukan.");
    return await setServiceCounters(getPrisma(), serviceId, body);
  });
}
