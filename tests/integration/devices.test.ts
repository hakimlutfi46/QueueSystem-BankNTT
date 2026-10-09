import "dotenv/config";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  createDevice,
  deviceMatcher,
  hashDeviceToken,
  listDevices,
  renameDevice,
  revokeDevice,
  rotateDevice,
  verifyDeviceToken,
} from "@/lib/auth/devices";
import { createTestPrisma, ensureTestDatabase } from "./database";

let prisma: PrismaClient;
let pool: { end: () => Promise<void> };
const originalKiosk = process.env.KIOSK_TOKEN;

beforeAll(async () => {
  const databaseUrl = await ensureTestDatabase();
  const created = createTestPrisma(databaseUrl);
  prisma = created.prisma;
  pool = created.pool;
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE TABLE devices, settings RESTART IDENTITY CASCADE`;
});

afterEach(() => {
  process.env.KIOSK_TOKEN = originalKiosk;
});

describe("devices", () => {
  it("issues a random token once and stores only its hash", async () => {
    const { device, token } = await createDevice(prisma, { kind: "kiosk", name: "Kiosk Lobi" });
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(device).toMatchObject({ kind: "kiosk", name: "Kiosk Lobi", tokenHint: token.slice(-4), lastSeenAt: null });

    const stored = await prisma.$queryRaw<{ token_hash: string }[]>`SELECT token_hash FROM devices`;
    expect(stored[0]?.token_hash).toBe(hashDeviceToken(token));
    expect(stored[0]?.token_hash).not.toContain(token);

    const other = await createDevice(prisma, { kind: "kiosk", name: "Kiosk Lantai 2" });
    expect(other.token).not.toBe(token);
  });

  it("accepts the token only for its own kind and records when the device was seen", async () => {
    const { token } = await createDevice(prisma, { kind: "display", name: "TV Ruang Tunggu" });
    await expect(verifyDeviceToken(prisma, "kiosk", token)).resolves.toBe(false);
    await expect(verifyDeviceToken(prisma, "display", "salah")).resolves.toBe(false);
    await expect(verifyDeviceToken(prisma, "display", token)).resolves.toBe(true);
    const [device] = await listDevices(prisma);
    expect(device?.lastSeenAt).not.toBeNull();
  });

  it("stops the old link after a new one is made, and revoking blocks the device", async () => {
    const first = await createDevice(prisma, { kind: "kiosk", name: "Kiosk Lobi" });
    const second = await rotateDevice(prisma, first.device.id);
    await expect(verifyDeviceToken(prisma, "kiosk", first.token)).resolves.toBe(false);
    await expect(verifyDeviceToken(prisma, "kiosk", second.token)).resolves.toBe(true);

    await revokeDevice(prisma, first.device.id);
    await expect(verifyDeviceToken(prisma, "kiosk", second.token)).resolves.toBe(false);

    const again = await rotateDevice(prisma, first.device.id);
    expect(again.device.revokedAt).toBeNull();
    await expect(verifyDeviceToken(prisma, "kiosk", again.token)).resolves.toBe(true);

    await expect(renameDevice(prisma, first.device.id, { name: "Kiosk Pintu Masuk" })).resolves.toMatchObject({
      name: "Kiosk Pintu Masuk",
    });
    await expect(createDevice(prisma, { kind: "kiosk", name: " " })).rejects.toMatchObject({
      message: "Nama perangkat wajib diisi.",
    });
  });

  it("still honours the optional .env token beside registered devices", async () => {
    process.env.KIOSK_TOKEN = "cadangan-kiosk";
    const matches = deviceMatcher(prisma);
    await expect(matches("kiosk", "cadangan-kiosk")).resolves.toBe(true);
    process.env.KIOSK_TOKEN = "";
    await expect(matches("kiosk", "cadangan-kiosk")).resolves.toBe(false);
  });
});
