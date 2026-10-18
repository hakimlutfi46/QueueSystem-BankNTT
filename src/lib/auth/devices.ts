import { createHash, randomBytes, randomInt } from "node:crypto";
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

/** Kode pemasangan untuk aplikasi Windows kiosk atau TV. `code` ditampilkan sekali, misalnya "4K7-Q2M". */
export type PairCode = { device: AdminDevice; code: string; expiresAt: string };

export type PairedDevice = { token: string; kind: DeviceKind; name: string };

/** Tanpa 0/O, 1/I, dan huruf mirip lain, supaya kode mudah dibaca dan diketik di PC kiosk atau TV. */
export const PAIR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIR_CODE_LENGTH = 6;
export const PAIR_CODE_TTL_MINUTES = 30;

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
      UPDATE devices
      SET revoked_at = COALESCE(revoked_at, now()), pair_code_hash = NULL, pair_code_expires_at = NULL
      WHERE id = ${id}
      RETURNING id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at
    `;
    const row = rows[0];
    if (!row) throw new AdminError("NOT_FOUND", "Perangkat tidak ditemukan.");
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
    return mapDevice(row);
  });
}

export function generatePairCode(): string {
  let code = "";
  for (let index = 0; index < PAIR_CODE_LENGTH; index += 1) code += PAIR_CODE_ALPHABET[randomInt(PAIR_CODE_ALPHABET.length)];
  return code;
}

/** "4k7-q2m" atau "4K7 Q2M" menjadi "4K7Q2M". Hasil null bila bukan kode yang mungkin dibuat server. */
export function normalizePairCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== PAIR_CODE_LENGTH || [...code].some((char) => !PAIR_CODE_ALPHABET.includes(char))) return null;
  return code;
}

export function formatPairCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function hashPairCode(code: string): string {
  return createHash("sha256").update(`pair:${code}`).digest("hex");
}

/**
 * Buat kode pemasangan baru untuk perangkat. Kode lama untuk perangkat yang sama langsung tidak berlaku.
 * Token perangkat belum diganti di sini; baru diganti saat kode ditukar, jadi kiosk atau TV yang terpasang tetap
 * jalan sampai aplikasi di PC perangkat itu benar-benar dipasangkan.
 */
export async function issuePairCode(db: PrismaClient, id: number): Promise<PairCode> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePairCode();
    const hash = hashPairCode(code);
    const taken = await db.$queryRaw<{ id: number }[]>`SELECT id FROM devices WHERE pair_code_hash = ${hash} LIMIT 1`;
    if (taken.length > 0) continue;
    const rows = await db.$queryRaw<(DeviceRow & { pair_code_expires_at: Date })[]>`
      UPDATE devices
      SET pair_code_hash = ${hash},
        pair_code_expires_at = now() + make_interval(mins => ${PAIR_CODE_TTL_MINUTES})
      WHERE id = ${id}
      RETURNING id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at, pair_code_expires_at
    `;
    const row = rows[0];
    if (!row) throw new AdminError("NOT_FOUND", "Perangkat tidak ditemukan.");
    return { device: mapDevice(row), code: formatPairCode(code), expiresAt: row.pair_code_expires_at.toISOString() };
  }
  throw new AdminError("PAIR_CODE_FAILED", "Kode pemasangan gagal dibuat. Coba lagi.");
}

/**
 * Tukar kode pemasangan dengan token perangkat baru, sekali pakai. Token lama ikut tidak berlaku dan
 * perangkat yang dicabut aktif lagi, sama seperti membuat tautan baru.
 */
export async function redeemPairCode(db: PrismaClient, input: unknown): Promise<PairedDevice> {
  const code = normalizePairCode(input);
  if (!code) throw new AdminError("VALIDATION", "Kode pemasangan harus 6 karakter, misalnya 4K7-Q2M.");
  const hash = hashPairCode(code);
  const token = generateDeviceToken();
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DeviceRow[]>`
      UPDATE devices
      SET token_hash = ${hashDeviceToken(token)}, token_hint = ${token.slice(-4)},
        revoked_at = NULL, last_seen_at = NULL, pair_code_hash = NULL, pair_code_expires_at = NULL
      WHERE pair_code_hash = ${hash} AND pair_code_expires_at > now()
      RETURNING id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at
    `;
    const row = rows[0];
    if (!row) {
      const expired = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM devices WHERE pair_code_hash = ${hash} LIMIT 1`;
      if (expired.length > 0) {
        throw new AdminError("PAIR_CODE_EXPIRED", "Kode pemasangan sudah kedaluwarsa. Buat kode baru di Admin → Perangkat.");
      }
      throw new AdminError("PAIR_CODE_INVALID", "Kode pemasangan tidak dikenal. Periksa lagi kodenya atau buat kode baru.");
    }
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
    const device = mapDevice(row);
    return { token, kind: device.kind, name: device.name };
  });
}

/**
 * Pendaftaran otomatis perangkat di jaringan lokal tanpa kode pemasangan manual.
 * Mengeluarkan token perangkat aktif dan mendaftarkan perangkat baru atau menggunakan yang ada.
 */
export async function autoRegisterDevice(
  db: PrismaClient,
  kindInput: unknown,
  nameInput?: unknown,
): Promise<PairedDevice> {
  const kind: DeviceKind = kindInput === "display" || kindInput === "DISPLAY" ? "display" : "kiosk";
  const token = generateDeviceToken();

  return db.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM devices
      WHERE kind = ${kind === "kiosk" ? "KIOSK" : "DISPLAY"}::device_kind AND revoked_at IS NULL
    `;
    const count = Number(existing[0]?.count ?? 0);
    const defaultName = kind === "kiosk"
      ? (count === 0 ? "Kiosk Tiket" : `Kiosk Tiket ${count + 1}`)
      : (count === 0 ? "Layar TV" : `Layar TV ${count + 1}`);

    const name = typeof nameInput === "string" && nameInput.trim() ? nameInput.trim().slice(0, 60) : defaultName;

    const created = await tx.$queryRaw<DeviceRow[]>`
      INSERT INTO devices (kind, name, token_hash, token_hint, last_seen_at)
      VALUES (
        ${kind === "kiosk" ? "KIOSK" : "DISPLAY"}::device_kind,
        ${name},
        ${hashDeviceToken(token)},
        ${token.slice(-4)},
        now()
      )
      RETURNING id, kind::text AS kind, name, token_hint, created_at, last_seen_at, revoked_at
    `;
    const row = created[0];
    if (!row) throw new AdminError("NOT_FOUND", "Perangkat gagal didaftarkan.");
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
    const device = mapDevice(row);
    return { token, kind: device.kind, name: device.name };
  });
}

/**
 * Hapus perangkat dari daftar. Hanya perangkat yang sudah dicabut, supaya kiosk atau TV yang masih dipakai
 * tidak hilang karena salah klik. Tidak ada tabel lain yang merujuk perangkat, jadi tiket dan laporan utuh.
 */
export async function deleteDevice(db: PrismaClient, id: number): Promise<{ id: number; name: string }> {
  const rows = await db.$queryRaw<{ id: number; name: string }[]>`
    DELETE FROM devices WHERE id = ${id} AND revoked_at IS NOT NULL
    RETURNING id, name
  `;
  const row = rows[0];
  if (row) return row;
  const exists = await db.$queryRaw<{ id: number }[]>`SELECT id FROM devices WHERE id = ${id}`;
  if (exists.length > 0) throw new AdminError("DEVICE_ACTIVE", "Cabut perangkat ini dulu sebelum menghapusnya.");
  throw new AdminError("NOT_FOUND", "Perangkat tidak ditemukan.");
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
