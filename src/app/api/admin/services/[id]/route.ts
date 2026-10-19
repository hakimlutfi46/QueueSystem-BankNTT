import { deleteService, updateService } from "@/lib/admin/services";
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
  const serviceId = resourceId(id);
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => {
    if (serviceId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    return { service: await updateService(getPrisma(), serviceId, body) };
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const serviceId = resourceId(id);
  return runAdmin(async () => {
    if (serviceId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    await deleteService(getPrisma(), serviceId);
    return { ok: true };
  });
}

