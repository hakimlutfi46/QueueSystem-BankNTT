import { guardAdmin, isGuard } from "@/app/api/admin/guard";
import { getPrisma } from "@/lib/db";
import { DEFAULT_KIOSK_APP_ICON, readKioskAppIcon } from "@/lib/kiosk/app-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pratinjau ikon aplikasi kiosk: ikon unggahan, atau simbol logo Bank NTT bawaan. */
export async function GET(request: Request): Promise<Response> {
  const access = await guardAdmin();
  if (isGuard(access)) return access;
  const icon = await readKioskAppIcon(getPrisma());
  if (!icon) return Response.redirect(new URL(DEFAULT_KIOSK_APP_ICON, request.url), 302);
  return new Response(new Uint8Array(icon.bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-cache", ETag: `"${icon.version}"` },
  });
}
