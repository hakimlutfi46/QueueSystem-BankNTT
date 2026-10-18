import { AdminError } from "@/lib/admin/errors";
import { approveDevice } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";
import { resourceId, runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Setujui perangkat yang mendaftar sendiri; layar yang menunggu terbuka dalam beberapa detik. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deviceId = resourceId((await params).id);
  return runAdmin(async () => {
    if (deviceId == null) throw new AdminError("VALIDATION", "Data tidak valid.");
    return { device: await approveDevice(getPrisma(), deviceId) };
  });
}
