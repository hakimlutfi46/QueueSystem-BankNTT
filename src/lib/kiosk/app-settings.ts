import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError, validationError } from "@/lib/admin/errors";

/**
 * Nama dan ikon aplikasi kiosk Windows. Disimpan di tabel settings dan dipakai saat installer dibuat
 * ulang dari Admin → Perangkat. Bawaannya "BANK NTT Ticket" dengan simbol logo Bank NTT.
 */
export const DEFAULT_KIOSK_APP_NAME = "BANK NTT Ticket";
export const DEFAULT_KIOSK_APP_ICON = "/brand/kiosk-app-icon.png";
/** Sama dengan aturan di apps/kiosk-desktop/scripts/build-and-copy.mjs: aman untuk nama berkas Windows. */
export const KIOSK_APP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,39}$/;
export const MAX_KIOSK_ICON_BYTES = 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type KioskAppSettings = {
  name: string;
  /** Sidik ikon unggahan; null berarti ikon bawaan. */
  iconVersion: string | null;
};

const body = z.object({
  name: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .regex(KIOSK_APP_NAME_PATTERN, "Nama aplikasi 2–40 karakter: huruf, angka, spasi, titik, strip, atau garis bawah."),
    ),
  /** Data URL PNG persegi dari browser, "default" untuk ikon bawaan, atau tidak diisi bila tidak diubah. */
  icon: z.string().optional(),
});

export async function readKioskAppSettings(db: PrismaClient): Promise<KioskAppSettings> {
  const rows = await db.$queryRaw<{ value: { name?: unknown; icon?: { version?: unknown } } }[]>`
    SELECT jsonb_build_object('name', value->'name', 'icon', jsonb_build_object('version', value->'icon'->'version')) AS value
    FROM settings WHERE key = 'kiosk_app'
  `;
  const value = rows[0]?.value;
  return {
    name: typeof value?.name === "string" && value.name ? value.name : DEFAULT_KIOSK_APP_NAME,
    iconVersion: typeof value?.icon?.version === "string" ? value.icon.version : null,
  };
}

export async function readKioskAppIcon(db: PrismaClient): Promise<{ bytes: Buffer; version: string } | null> {
  const rows = await db.$queryRaw<{ value: { icon?: { data?: unknown; version?: unknown } } }[]>`
    SELECT value FROM settings WHERE key = 'kiosk_app'
  `;
  const icon = rows[0]?.value?.icon;
  if (!icon || typeof icon.data !== "string" || typeof icon.version !== "string") return null;
  return { bytes: Buffer.from(icon.data, "base64"), version: icon.version };
}

export async function saveKioskAppSettings(db: PrismaClient, input: unknown): Promise<KioskAppSettings> {
  const parsed = body.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const current = await db.$queryRaw<{ value: { icon?: unknown } }[]>`SELECT value FROM settings WHERE key = 'kiosk_app'`;
  let icon = current[0]?.value?.icon ?? null;
  if (parsed.data.icon === "default") icon = null;
  else if (parsed.data.icon) icon = parseIcon(parsed.data.icon);

  const json = JSON.stringify({ name: parsed.data.name, icon });
  await db.$executeRaw`
    INSERT INTO settings (key, value) VALUES ('kiosk_app', ${json}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return readKioskAppSettings(db);
}

/** Ikon dikirim browser sebagai PNG persegi 512 px; server hanya memeriksa jenis dan ukurannya. */
function parseIcon(dataUrl: string): { data: string; version: string } {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match?.[1]) throw new AdminError("VALIDATION", "Ikon harus gambar PNG.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new AdminError("VALIDATION", "Ikon harus gambar PNG.");
  }
  if (bytes.length > MAX_KIOSK_ICON_BYTES) throw new AdminError("VALIDATION", "Ikon paling besar 1 MB.");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== height || width < 256) throw new AdminError("VALIDATION", "Ikon harus persegi, minimal 256 × 256 piksel.");
  return { data: bytes.toString("base64"), version: createHash("sha256").update(bytes).digest("hex").slice(0, 12) };
}
