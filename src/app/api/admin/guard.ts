import { adminDenied, currentUser } from "@/lib/auth/session";
import { adminErrorResponse } from "@/lib/admin/errors";

export async function guardAdmin(): Promise<Response | { id: number }> {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN" || user.mustChangePassword) {
    return adminDenied(user) as Response;
  }
  return { id: user.id };
}

export function isGuard(value: Response | { id: number }): value is Response {
  return value instanceof Response;
}

export async function runAdmin(action: () => Promise<unknown>): Promise<Response> {
  const access = await guardAdmin();
  if (isGuard(access)) return access;
  try {
    return Response.json(await action());
  } catch (error) {
    const known = adminErrorResponse(error);
    if (known) return known;
    console.error(error);
    return Response.json(
      { error: { code: "ADMIN_FAILED", message: "Perubahan gagal disimpan." } },
      { status: 500 },
    );
  }
}

export function resourceId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}
