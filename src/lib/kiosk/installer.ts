import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Installer aplikasi kiosk Windows yang dibuat `npm run kiosk:build` atau tombol Build ulang di Admin.
 * Berkasnya tidak masuk git; server cabang menyajikannya dari folder downloads/ supaya bisa diunduh
 * lewat jaringan lokal. Skrip build menulis downloads/kiosk-installer.json berisi nama berkas dan nama
 * aplikasi. KIOSK_INSTALLER_PATH dipakai bila berkas .exe disimpan di tempat lain.
 */
export const LEGACY_INSTALLER_NAME = "Kiosk-Antrian-Setup.exe";

export type KioskInstaller = {
  path: string;
  fileName: string;
  /** Nama aplikasi yang dipakai saat build; null untuk installer lama tanpa catatan. */
  appName: string | null;
  size: number;
  builtAt: string;
  platform?: "win" | "mac";
};

export function downloadsDir(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "downloads");
}

export async function findKioskInstaller(
  env: NodeJS.ProcessEnv = process.env,
  platform: "win" | "mac" = "win",
): Promise<KioskInstaller | null> {
  const configured = env.KIOSK_INSTALLER_PATH?.trim();
  if (configured) return describe(path.resolve(configured), null);

  const manifest = await readManifest(platform);
  if (manifest) {
    const found = await describe(path.join(downloadsDir(), manifest.file), manifest.name);
    if (found) return { ...found, platform };
  }
  return describe(path.join(downloadsDir(), LEGACY_INSTALLER_NAME), null);
}

async function readManifest(platform: "win" | "mac" = "win"): Promise<{ file: string; name: string | null } | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(downloadsDir(), "kiosk-installer.json"), "utf8")) as {
      file?: unknown;
      macFile?: unknown;
      name?: unknown;
    };
    const target =
      platform === "mac"
        ? (typeof raw.macFile === "string" ? raw.macFile : null)
        : (typeof raw.file === "string" ? raw.file : null);
    const chosen = target ?? (typeof raw.file === "string" ? raw.file : (typeof raw.macFile === "string" ? raw.macFile : null));
    if (!chosen || chosen !== path.basename(chosen) || (!chosen.endsWith(".exe") && !chosen.endsWith(".dmg"))) return null;
    return { file: chosen, name: typeof raw.name === "string" ? raw.name : null };
  } catch {
    return null;
  }
}

async function describe(file: string, appName: string | null): Promise<KioskInstaller | null> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) return null;
    return { path: file, fileName: path.basename(file), appName, size: info.size, builtAt: info.mtime.toISOString() };
  } catch {
    return null;
  }
}
