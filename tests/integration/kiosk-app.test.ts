import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  DEFAULT_KIOSK_APP_NAME,
  readKioskAppIcon,
  readKioskAppSettings,
  saveKioskAppSettings,
} from "@/lib/kiosk/app-settings";
import { createTestPrisma, ensureTestDatabase } from "./database";

let prisma: PrismaClient;
let pool: { end: () => Promise<void> };

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
  await prisma.$executeRaw`DELETE FROM settings WHERE key = 'kiosk_app'`;
});

/** PNG minimal dengan ukuran yang dibaca dari header IHDR; isinya tidak diperiksa server. */
function png(width: number, height: number): string {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

describe("Windows kiosk app name and icon", () => {
  it("defaults to BANK NTT Ticket with the built-in icon", async () => {
    await expect(readKioskAppSettings(prisma)).resolves.toEqual({ name: DEFAULT_KIOSK_APP_NAME, iconVersion: null });
    expect(DEFAULT_KIOSK_APP_NAME).toBe("BANK NTT Ticket");
  });

  it("saves a custom name and a square PNG icon, then goes back to the default icon", async () => {
    const saved = await saveKioskAppSettings(prisma, { name: "  Bank  Cabang Kupang ", icon: png(512, 512) });
    expect(saved.name).toBe("Bank Cabang Kupang");
    expect(saved.iconVersion).toMatch(/^[0-9a-f]{12}$/);
    expect((await readKioskAppIcon(prisma))?.bytes.subarray(1, 4).toString()).toBe("PNG");

    // Mengganti nama saja tidak menghapus ikon.
    await expect(saveKioskAppSettings(prisma, { name: "Antrian Kupang" })).resolves.toMatchObject({ iconVersion: saved.iconVersion });

    await expect(saveKioskAppSettings(prisma, { name: "Antrian Kupang", icon: "default" })).resolves.toEqual({
      name: "Antrian Kupang",
      iconVersion: null,
    });
    await expect(readKioskAppIcon(prisma)).resolves.toBeNull();
  });

  it("rejects names that are unsafe for Windows files and icons that are not square PNGs", async () => {
    for (const name of ["", "A", 'Bank "NTT"', "Bank/NTT", "x".repeat(41), "-Bank"]) {
      await expect(saveKioskAppSettings(prisma, { name })).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(saveKioskAppSettings(prisma, { name: "Bank NTT", icon: png(512, 256) })).rejects.toThrow("persegi");
    await expect(saveKioskAppSettings(prisma, { name: "Bank NTT", icon: png(128, 128) })).rejects.toThrow("256");
    await expect(
      saveKioskAppSettings(prisma, { name: "Bank NTT", icon: "data:image/png;base64,aGVsbG8=" }),
    ).rejects.toThrow("PNG");
    await expect(saveKioskAppSettings(prisma, { name: "Bank NTT", icon: "data:image/svg+xml;base64,PHN2Zz4=" })).rejects.toThrow("PNG");
    await expect(readKioskAppSettings(prisma)).resolves.toEqual({ name: DEFAULT_KIOSK_APP_NAME, iconVersion: null });
  });
});
