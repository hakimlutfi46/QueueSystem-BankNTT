import "dotenv/config";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  approveDevice,
  autoRegisterDevice,
  createDevice,
  deleteDevice,
  deviceMatcher,
  deviceTokenStatus,
  hashDeviceToken,
  issuePairCode,
  listDevices,
  redeemPairCode,
  renameDevice,
  revokeDevice,
  MAX_PENDING_DEVICES,
  rotateDevice,
  setAutoApprove,
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

  it("pairs the Windows kiosk app with a one-time short code that replaces the old link", async () => {
    const { device, token: linkToken } = await createDevice(prisma, { kind: "kiosk", name: "Kiosk Lobi" });
    const issued = await issuePairCode(prisma, device.id);
    expect(issued.code).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    expect(Date.parse(issued.expiresAt) - Date.now()).toBeGreaterThan(29 * 60_000);

    // Membuat kode belum mengganti token: kiosk yang terpasang lewat tautan tetap jalan.
    await expect(verifyDeviceToken(prisma, "kiosk", linkToken)).resolves.toBe(true);
    const stored = await prisma.$queryRaw<{ pair_code_hash: string }[]>`SELECT pair_code_hash FROM devices`;
    expect(stored[0]?.pair_code_hash).not.toContain(issued.code.replace("-", ""));

    const paired = await redeemPairCode(prisma, issued.code.toLowerCase().replace("-", " "));
    expect(paired).toMatchObject({ kind: "kiosk", name: "Kiosk Lobi" });
    await expect(verifyDeviceToken(prisma, "kiosk", paired.token)).resolves.toBe(true);
    await expect(verifyDeviceToken(prisma, "kiosk", linkToken)).resolves.toBe(false);

    await expect(redeemPairCode(prisma, issued.code)).rejects.toMatchObject({ code: "PAIR_CODE_INVALID" });
    await expect(redeemPairCode(prisma, "ABC")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("pairs the Windows TV app with a short code and the new token opens only the TV", async () => {
    const { device, token: linkToken } = await createDevice(prisma, { kind: "display", name: "TV Ruang Tunggu" });
    const issued = await issuePairCode(prisma, device.id);
    expect(issued.device).toMatchObject({ kind: "display", name: "TV Ruang Tunggu" });
    expect(issued.code).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    await expect(verifyDeviceToken(prisma, "display", linkToken)).resolves.toBe(true);

    const paired = await redeemPairCode(prisma, issued.code);
    expect(paired).toMatchObject({ kind: "display", name: "TV Ruang Tunggu" });
    await expect(verifyDeviceToken(prisma, "display", paired.token)).resolves.toBe(true);
    await expect(verifyDeviceToken(prisma, "kiosk", paired.token)).resolves.toBe(false);
    await expect(verifyDeviceToken(prisma, "display", linkToken)).resolves.toBe(false);
    await expect(redeemPairCode(prisma, issued.code)).rejects.toMatchObject({ code: "PAIR_CODE_INVALID" });
  });

  it("rejects an expired code, keeps only the newest code, and drops codes when the device is revoked", async () => {
    const { device } = await createDevice(prisma, { kind: "kiosk", name: "Kiosk Lobi" });
    const first = await issuePairCode(prisma, device.id);
    const second = await issuePairCode(prisma, device.id);
    await expect(redeemPairCode(prisma, first.code)).rejects.toMatchObject({ code: "PAIR_CODE_INVALID" });

    await prisma.$executeRaw`UPDATE devices SET pair_code_expires_at = now() - interval '1 minute'`;
    await expect(redeemPairCode(prisma, second.code)).rejects.toMatchObject({ code: "PAIR_CODE_EXPIRED" });

    const third = await issuePairCode(prisma, device.id);
    await revokeDevice(prisma, device.id);
    await expect(redeemPairCode(prisma, third.code)).rejects.toMatchObject({ code: "PAIR_CODE_INVALID" });

    await expect(issuePairCode(prisma, 9999)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes a device only after it has been revoked", async () => {
    const { device, token } = await createDevice(prisma, { kind: "display", name: "TV Lama" });
    await expect(deleteDevice(prisma, device.id)).rejects.toMatchObject({ code: "DEVICE_ACTIVE" });
    await expect(verifyDeviceToken(prisma, "display", token)).resolves.toBe(true);

    await revokeDevice(prisma, device.id);
    await expect(deleteDevice(prisma, device.id)).resolves.toEqual({ id: device.id, name: "TV Lama" });
    await expect(listDevices(prisma)).resolves.toEqual([]);
    await expect(verifyDeviceToken(prisma, "display", token)).resolves.toBe(false);
    await expect(deleteDevice(prisma, device.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("makes a self-registered device wait for admin approval before it opens the kiosk", async () => {
    const first = await autoRegisterDevice(prisma, "kiosk");
    expect(first).toMatchObject({ kind: "kiosk", name: "Kiosk Tiket", approved: false });
    await expect(verifyDeviceToken(prisma, "kiosk", first.token)).resolves.toBe(false);
    await expect(deviceTokenStatus(prisma, "kiosk", first.token)).resolves.toBe("pending");

    const [listed] = await listDevices(prisma);
    expect(listed).toMatchObject({ name: "Kiosk Tiket", approvedAt: null, revokedAt: null });
    await approveDevice(prisma, listed!.id);
    await expect(verifyDeviceToken(prisma, "kiosk", first.token)).resolves.toBe(true);
    await expect(deviceTokenStatus(prisma, "kiosk", first.token)).resolves.toBe("active");

    const tv = await autoRegisterDevice(prisma, "display");
    expect(tv).toMatchObject({ kind: "display", name: "Layar TV", approved: false });
    await expect(deviceTokenStatus(prisma, "display", "not-a-token")).resolves.toBe("unknown");
  });

  it("keeps one device per installation and never brings a revoked one back by itself", async () => {
    const installId = "3f2b8c1e-0d4a-4c55-9a77-1b2c3d4e5f60";
    const first = await autoRegisterDevice(prisma, "kiosk", "Kiosk Lobi", installId);
    const [device] = await listDevices(prisma);
    await approveDevice(prisma, device!.id);

    // Reinstall on the same PC: same row, new token, still approved, old token stops working.
    const again = await autoRegisterDevice(prisma, "kiosk", "Kiosk Lobi", installId);
    expect(again.approved).toBe(true);
    expect(again.token).not.toBe(first.token);
    await expect(listDevices(prisma)).resolves.toHaveLength(1);
    await expect(verifyDeviceToken(prisma, "kiosk", first.token)).resolves.toBe(false);
    await expect(verifyDeviceToken(prisma, "kiosk", again.token)).resolves.toBe(true);

    await revokeDevice(prisma, device!.id);
    await expect(deviceTokenStatus(prisma, "kiosk", again.token)).resolves.toBe("revoked");
    await expect(autoRegisterDevice(prisma, "kiosk", "Kiosk Lobi", installId)).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
    await expect(approveDevice(prisma, device!.id)).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
    await expect(listDevices(prisma)).resolves.toHaveLength(1);
  });

  it("approves new devices at once while auto-approve is on, and caps devices waiting for approval", async () => {
    await setAutoApprove(prisma, true);
    const kiosk = await autoRegisterDevice(prisma, "kiosk");
    expect(kiosk.approved).toBe(true);
    await expect(verifyDeviceToken(prisma, "kiosk", kiosk.token)).resolves.toBe(true);

    await setAutoApprove(prisma, false);
    for (let index = 1; index < MAX_PENDING_DEVICES + 1; index += 1) await autoRegisterDevice(prisma, "display");
    await expect(autoRegisterDevice(prisma, "display")).rejects.toMatchObject({ code: "TOO_MANY_PENDING" });
  });

  it("approves the kiosk on the server PC itself at once when it proves the local key", async () => {
    const local = await autoRegisterDevice(prisma, "kiosk", "Kiosk Mesin Tiket", "c0ffee00-0000-4000-8000-000000000001", { approve: true });
    expect(local.approved).toBe(true);
    await expect(verifyDeviceToken(prisma, "kiosk", local.token)).resolves.toBe(true);
    const other = await autoRegisterDevice(prisma, "display", "TV Lobi", "c0ffee00-0000-4000-8000-000000000002");
    expect(other.approved).toBe(false);
  });

  it("approves devices created or paired by the admin without a separate step", async () => {
    const created = await createDevice(prisma, { kind: "display", name: "TV Lobi" });
    expect(created.device.approvedAt).not.toBeNull();
    const pending = await autoRegisterDevice(prisma, "kiosk", "Kiosk Baru", "a1b2c3d4-0000-4000-8000-000000000001");
    expect(pending.approved).toBe(false);
    const [waiting] = (await listDevices(prisma)).filter((device) => !device.approvedAt);
    const code = await issuePairCode(prisma, waiting!.id);
    const paired = await redeemPairCode(prisma, code.code, "a1b2c3d4-0000-4000-8000-000000000001");
    expect(paired.approved).toBe(true);
    await expect(verifyDeviceToken(prisma, "kiosk", paired.token)).resolves.toBe(true);
  });
});
