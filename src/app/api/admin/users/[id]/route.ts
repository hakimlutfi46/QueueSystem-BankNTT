import { deleteUser, updateUser } from "@/lib/admin/users";
import { AdminError } from "@/lib/admin/errors";
import { getPrisma } from "@/lib/db";
import { isGuard, guardAdmin, resourceId, runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const access = await guardAdmin();
  if (isGuard(access)) return access;
  const { id } = await params;
  const userId = resourceId(id);
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => {
    if (userId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    return { user: await updateUser(getPrisma(), userId, access.id, body) };
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const access = await guardAdmin();
  if (isGuard(access)) return access;
  const { id } = await params;
  const userId = resourceId(id);
  return runAdmin(async () => {
    if (userId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    await deleteUser(getPrisma(), userId, access.id);
    return { ok: true };
  });
}

