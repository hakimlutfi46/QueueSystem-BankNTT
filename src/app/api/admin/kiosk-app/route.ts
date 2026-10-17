import { getPrisma } from "@/lib/db";
import { saveKioskAppSettings } from "@/lib/kiosk/app-settings";
import { kioskAppOverview } from "@/lib/kiosk/overview";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nama, ikon, installer, dan status build aplikasi kiosk Windows. Dipanggil berulang selama build. */
export async function GET(): Promise<Response> {
  return runAdmin(async () => kioskAppOverview(getPrisma()));
}

/** Simpan nama dan ikon. Installer baru memakainya setelah dibuat ulang. */
export async function PUT(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  return runAdmin(async () => {
    await saveKioskAppSettings(getPrisma(), body);
    return kioskAppOverview(getPrisma());
  });
}
