import { AdminError } from "@/lib/admin/errors";
import { getPrisma } from "@/lib/db";
import { forceCloseCounter } from "@/lib/queue/desk";
import { QueueError } from "@/lib/queue/errors";
import { guardAdmin, isGuard, resourceId, runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tutup paksa loket dari Admin, misalnya bila petugas pulang tanpa menutup loketnya. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const access = await guardAdmin();
  if (isGuard(access)) return access;
  const { id } = await params;
  const counterId = resourceId(id);
  return runAdmin(async () => {
    if (counterId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    try {
      return { counter: await forceCloseCounter(getPrisma(), { counterId, adminId: access.id }) };
    } catch (error) {
      if (error instanceof QueueError && error.code === "COUNTER_NOT_FOUND") {
        throw new AdminError("NOT_FOUND", "Loket tidak ditemukan.");
      }
      throw error;
    }
  });
}
