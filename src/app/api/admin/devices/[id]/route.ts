import { AdminError } from "@/lib/admin/errors";
import { deleteDevice, renameDevice } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";
import { resourceId, runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deviceId = resourceId((await params).id);
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => {
    if (deviceId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    return { device: await renameDevice(getPrisma(), deviceId, body) };
  });
}

/** Hapus perangkat yang sudah dicabut dari daftar. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deviceId = resourceId((await params).id);
  return runAdmin(async () => {
    if (deviceId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    return { device: await deleteDevice(getPrisma(), deviceId) };
  });
}
