import type { PrismaClient } from "@/generated/prisma/client";
import { readKioskAppSettings, type KioskAppSettings } from "@/lib/kiosk/app-settings";
import { kioskBuildAvailable, kioskBuildStatus, type KioskBuildStatus } from "@/lib/kiosk/build";
import { findKioskInstaller } from "@/lib/kiosk/installer";

/** Semua yang ditampilkan panel aplikasi kiosk Windows di Admin → Perangkat. */
export type KioskAppOverview = {
  settings: KioskAppSettings;
  installer: { fileName: string; appName: string | null; size: number; builtAt: string } | null;
  build: KioskBuildStatus;
  buildAvailable: boolean;
};

export async function kioskAppOverview(db: PrismaClient): Promise<KioskAppOverview> {
  const [settings, installer] = await Promise.all([readKioskAppSettings(db), findKioskInstaller()]);
  return {
    settings,
    installer: installer
      ? { fileName: installer.fileName, appName: installer.appName, size: installer.size, builtAt: installer.builtAt }
      : null,
    build: kioskBuildStatus(),
    buildAvailable: kioskBuildAvailable(),
  };
}
