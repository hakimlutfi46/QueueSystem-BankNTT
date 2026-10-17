import { getPrisma } from "@/lib/db";
import { readKioskAppIcon, readKioskAppSettings } from "@/lib/kiosk/app-settings";
import { startKioskBuild } from "@/lib/kiosk/build";
import { kioskAppOverview } from "@/lib/kiosk/overview";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mulai membuat ulang installer dengan nama dan ikon yang tersimpan. Hasilnya ada di downloads/. */
export async function POST(): Promise<Response> {
  return runAdmin(async () => {
    const db = getPrisma();
    const [settings, icon] = await Promise.all([readKioskAppSettings(db), readKioskAppIcon(db)]);
    await startKioskBuild({ appName: settings.name, icon: icon?.bytes ?? null });
    return kioskAppOverview(db);
  });
}
