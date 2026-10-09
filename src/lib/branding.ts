import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError, validationError } from "@/lib/admin/errors";
import { BRAND_COLOR_KEYS, HEX_COLOR, type BrandColors } from "@/lib/branding-colors";
import { notifyQueue } from "@/lib/queue/sql";

/**
 * Identitas lembaga: nama, slogan, logo, dan warna merek. Disimpan di tabel settings supaya aplikasi
 * yang sama bisa dipakai lembaga lain tanpa mengubah kode. Bawaannya Bank NTT.
 */

export const DEFAULT_BRANDING = {
  orgName: "Bank NTT",
  tagline: "melayani lebih sungguh",
  defaultLogo: "/brand/Logo_Bank_NTT.png",
} as const;

export type Branding = {
  orgName: string;
  tagline: string;
  colors: BrandColors;
  /** Sidik logo unggahan; null berarti logo bawaan. */
  logoVersion: string | null;
};

export type PublicBranding = { orgName: string; tagline: string; logoSrc: string; colors: BrandColors };

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const MAX_LOGO_BYTES = 512 * 1024;

const brandingBody = z.object({
  orgName: z.string().trim().min(1, "Nama lembaga wajib diisi.").max(80, "Nama lembaga paling panjang 80 karakter."),
  tagline: z.string().trim().max(80, "Slogan paling panjang 80 karakter."),
  colors: z
    .partialRecord(z.enum(BRAND_COLOR_KEYS), z.string().regex(HEX_COLOR, "Warna harus kode hex enam digit."))
    .optional(),
});

const logoBody = z.object({
  dataUrl: z.string().regex(/^data:[a-z+/]+;base64,[A-Za-z0-9+/=]+$/, "Berkas logo tidak terbaca."),
});

export async function readBranding(db: PrismaClient): Promise<Branding> {
  const rows = await db.$queryRaw<{ key: string; value: unknown }[]>`
    SELECT key,
      CASE WHEN key = 'brand_logo' THEN jsonb_build_object('version', value->'version') ELSE value END AS value
    FROM settings
    WHERE key IN ('org_name', 'org_tagline', 'brand_colors', 'brand_logo')
  `;
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const colors = values.get("brand_colors");
  const logo = values.get("brand_logo") as { version?: unknown } | undefined;
  return {
    orgName: text(values.get("org_name")) || DEFAULT_BRANDING.orgName,
    tagline: typeof values.get("org_tagline") === "string" ? String(values.get("org_tagline")) : DEFAULT_BRANDING.tagline,
    colors: cleanColors(colors),
    logoVersion: typeof logo?.version === "string" ? logo.version : null,
  };
}

/** Versi untuk layar publik. Bila database tidak terjangkau, tampil identitas bawaan. */
export async function readPublicBranding(db: PrismaClient): Promise<PublicBranding> {
  const branding = await readBranding(db).catch(() => null);
  if (!branding) {
    return { orgName: DEFAULT_BRANDING.orgName, tagline: DEFAULT_BRANDING.tagline, logoSrc: DEFAULT_BRANDING.defaultLogo, colors: {} };
  }
  return {
    orgName: branding.orgName,
    tagline: branding.tagline,
    colors: branding.colors,
    logoSrc: branding.logoVersion ? `/api/brand/logo?v=${branding.logoVersion}` : DEFAULT_BRANDING.defaultLogo,
  };
}

export async function saveBranding(db: PrismaClient, body: unknown): Promise<Branding> {
  const parsed = brandingBody.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const colors = cleanColors(parsed.data.colors ?? {});
  await db.$transaction(async (tx) => {
    await upsert(tx, "org_name", parsed.data.orgName);
    await upsert(tx, "org_tagline", parsed.data.tagline);
    await upsert(tx, "brand_colors", colors);
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
  });
  return readBranding(db);
}

/** Simpan logo dari data URL. PNG, JPG, WebP, atau SVG, paling besar 512 KB. */
export async function saveLogo(db: PrismaClient, body: unknown): Promise<Branding> {
  const parsed = logoBody.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const match = /^data:([a-z+/]+);base64,(.+)$/.exec(parsed.data.dataUrl);
  const mime = match?.[1] ?? "";
  if (!(LOGO_TYPES as readonly string[]).includes(mime)) {
    throw new AdminError("VALIDATION", "Logo harus berkas PNG, JPG, WebP, atau SVG.");
  }
  const bytes = Buffer.from(match?.[2] ?? "", "base64");
  if (bytes.length === 0) throw new AdminError("VALIDATION", "Berkas logo kosong.");
  if (bytes.length > MAX_LOGO_BYTES) throw new AdminError("VALIDATION", "Logo paling besar 512 KB.");
  const version = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  await db.$transaction(async (tx) => {
    await upsert(tx, "brand_logo", { mime, data: bytes.toString("base64"), version });
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
  });
  return readBranding(db);
}

/** Hapus logo unggahan dan kembali ke logo bawaan. */
export async function removeLogo(db: PrismaClient): Promise<Branding> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM settings WHERE key = 'brand_logo'`;
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
  });
  return readBranding(db);
}

export async function readLogo(db: PrismaClient): Promise<{ mime: string; bytes: Buffer; version: string } | null> {
  const rows = await db.$queryRaw<{ value: { mime?: unknown; data?: unknown; version?: unknown } }[]>`
    SELECT value FROM settings WHERE key = 'brand_logo'
  `;
  const value = rows[0]?.value;
  if (!value || typeof value.mime !== "string" || typeof value.data !== "string" || typeof value.version !== "string") {
    return null;
  }
  return { mime: value.mime, bytes: Buffer.from(value.data, "base64"), version: value.version };
}

async function upsert(
  tx: { $executeRaw: PrismaClient["$executeRaw"] },
  key: string,
  value: unknown,
): Promise<void> {
  const json = JSON.stringify(value);
  await tx.$executeRaw`
    INSERT INTO settings (key, value) VALUES (${key}, ${json}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

function cleanColors(value: unknown): BrandColors {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const colors: BrandColors = {};
  for (const key of BRAND_COLOR_KEYS) {
    const color = record[key];
    if (typeof color === "string" && HEX_COLOR.test(color)) colors[key] = color.toLowerCase();
  }
  return colors;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
