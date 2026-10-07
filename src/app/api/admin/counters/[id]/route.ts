import { updateCounter } from "@/lib/admin/counters";
import { AdminError } from "@/lib/admin/errors";
import { getPrisma } from "@/lib/db";
import { resourceId, runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const counterId = resourceId(id);
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => {
    if (counterId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    return { counter: await updateCounter(getPrisma(), counterId, body) };
  });
}
