import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError, validationError } from "@/lib/admin/errors";
import { envDeviceMatcher, type DeviceKind, type DeviceMatcher } from "@/lib/auth/device";
import { notifyQueue } from "@/lib/queue/sql";

/**
 * Kiosk dan TV yang didaftarkan Admin. Token dibuat server, ditampilkan sekali di tautan pemasangan,
 * lalu hanya hash SHA-256-nya yang disimpan. Perangkat menyimpan token mentah di cookie.
 */

export type AdminDevice = {
  id: number;
  kind: DeviceKind;
  name: string;
  tokenHint: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

export type IssuedDevice = { device: AdminDevice; token: string };

const deviceBody = z.object({
  kind: z.enum(["kiosk", "display"], { error: "Jenis perangkat harus Kiosk atau TV." }),
  name: z.string().trim().min(1, "Nama perangkat wajib diisi.").max(60, "Nama perangkat paling panjang 60 karakter."),
});

const renameBody = z.object({
  name: z.string().trim().min(1, "Nama perangkat wajib diisi.").max(60, "Nama perangkat paling panjang 60 karakter."),
});

/** Catat "terakhir aktif" paling sering sekali per menit per perangkat. */
const SEEN_INTERVAL_SECONDS = 60;

type DeviceRow = {
  id: number;
  kind: string;
  name: string;
  token_hint: string;
  created_at: Date;
  last_seen_at: Date | null;
  revoked_at: Date | null;
};

export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listDevices(db: PrismaClient): Promise<AdminDevice[]> {
  const rows = await db.$queryRaw<DeviceRow[]>`
    SELECT id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at
    FROM devices
    ORDER BY revoked_at IS NOT NULL, kind, name, id
  `;
  return rows.map(mapDevice);
}

export async function createDevice(db: PrismaClient, body: unknown): Promise<IssuedDevice> {
  const parsed = deviceBody.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const token = generateDeviceToken();
  const rows = await db.$queryRaw<DeviceRow[]>`
    INSERT INTO devices (kind, name, token_hash, token_hint)
    VALUES (
      ${parsed.data.kind === "kiosk" ? "KIOSK" : "DISPLAY"}::device_kind,
      ${parsed.data.name},
      ${hashDeviceToken(token)},
      ${token.slice(-4)}
    )
    RETURNING id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at
  `;
  const row = rows[0];
  if (!row) throw new AdminError("NOT_FOUND", "Perangkat gagal dibuat.");
  return { device: mapDevice(row), token };
}

export async function renameDevice(db: PrismaClient, id: number, body: unknown): Promise<AdminDevice> {
  const parsed = renameBody.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const rows = await db.$queryRaw<DeviceRow[]>`
    UPDATE devices SET name = ${parsed.data.name} WHERE id = ${id}
    RETURNING id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at
  `;
  const row = rows[0];
  if (!row) throw new AdminError("NOT_FOUND", "Perangkat tidak ditemukan.");
  return mapDevice(row);
}

/** Token baru untuk perangkat yang sama. Token lama langsung tidak berlaku; perangkat yang dicabut aktif lagi. */
export async function rotateDevice(db: PrismaClient, id: number): Promise<IssuedDevice> {
  const token = generateDeviceToken();
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DeviceRow[]>`
      UPDATE devices
      SET token_hash = ${hashDeviceToken(token)}, token_hint = ${token.slice(-4)},
        revoked_at = NULL, last_seen_at = NULL
      WHERE id = ${id}
      RETURNING id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at
    `;
    const row = rows[0];
    if (!row) throw new AdminError("NOT_FOUND", "Perangkat tidak ditemukan.");
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
    return { device: mapDevice(row), token };
  });
}

/** Cabut izin perangkat. Layar yang sedang terbuka kehilangan akses pada permintaan berikutnya. */
export async function revokeDevice(db: PrismaClient, id: number): Promise<AdminDevice> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DeviceRow[]>`
      UPDATE devices SET revoked_at = COALESCE(revoked_at, now()) WHERE id = ${id}
      RETURNING id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at
    `;
    const row = rows[0];
    if (!row) throw new AdminError("NOT_FOUND", "Perangkat tidak ditemukan.");
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
    return mapDevice(row);
  });
}

/** Benar bila token milik perangkat aktif berjenis sama. Sekaligus mencatat waktu terakhir aktif. */
export async function verifyDeviceToken(db: PrismaClient, kind: DeviceKind, token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const rows = await db.$queryRaw<{ id: number; stale: boolean }[]>`
    SELECT id,
      (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => ${SEEN_INTERVAL_SECONDS})) AS stale
    FROM devices
    WHERE token_hash = ${hashDeviceToken(token)}
      AND kind = ${kind === "kiosk" ? "KIOSK" : "DISPLAY"}::device_kind
      AND revoked_at IS NULL
    LIMIT 1
  `;
  const device = rows[0];
  if (!device) return false;
  if (device.stale) {
    await db.$executeRaw`UPDATE devices SET last_seen_at = now() WHERE id = ${device.id}`;
  }
  return true;
}

function mapDevice(row: DeviceRow): AdminDevice {
  return {
    id: row.id,
    kind: row.kind === "KIOSK" ? "kiosk" : "display",
    name: row.name,
    tokenHint: row.token_hint,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
  };
}

/** Perangkat terdaftar di database, lalu token cadangan .env bila diisi. */
export function deviceMatcher(db: PrismaClient): DeviceMatcher {
  return async (kind, token) => (await envDeviceMatcher(kind, token)) || verifyDeviceToken(db, kind, token);
}
