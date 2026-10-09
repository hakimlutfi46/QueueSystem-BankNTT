import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { readBranding, readLogo, readPublicBranding, removeLogo, saveBranding, saveLogo } from "@/lib/branding";
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
  await prisma.$executeRaw`TRUNCATE TABLE settings RESTART IDENTITY CASCADE`;
});

describe("branding", () => {
  it("defaults to Bank NTT and saves another organisation", async () => {
    await expect(readBranding(prisma)).resolves.toEqual({
      orgName: "Bank NTT",
      tagline: "melayani lebih sungguh",
      colors: {},
      logoVersion: null,
    });
    await saveBranding(prisma, {
      orgName: "Bank Flores",
      tagline: "",
      colors: { navy: "#7A0019", orange: "#FFB400" },
    });
    await expect(readPublicBranding(prisma)).resolves.toEqual({
      orgName: "Bank Flores",
      tagline: "",
      colors: { navy: "#7a0019", orange: "#ffb400" },
      logoSrc: "/brand/Logo_Bank_NTT.png",
    });
    await expect(saveBranding(prisma, { orgName: "X", tagline: "", colors: { navy: "merah" } })).rejects.toMatchObject({
      message: "Warna harus kode hex enam digit.",
    });
  });

  it("stores an uploaded logo, serves a versioned address, and can go back to the default", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const saved = await saveLogo(prisma, { dataUrl: `data:image/png;base64,${png.toString("base64")}` });
    expect(saved.logoVersion).toMatch(/^[0-9a-f]{12}$/);
    await expect(readPublicBranding(prisma)).resolves.toMatchObject({
      logoSrc: `/api/brand/logo?v=${saved.logoVersion}`,
    });
    const logo = await readLogo(prisma);
    expect(logo?.mime).toBe("image/png");
    expect(logo?.bytes.equals(png)).toBe(true);

    await expect(
      saveLogo(prisma, { dataUrl: `data:text/html;base64,${Buffer.from("<script>").toString("base64")}` }),
    ).rejects.toMatchObject({ message: "Logo harus berkas PNG, JPG, WebP, atau SVG." });
    await expect(
      saveLogo(prisma, { dataUrl: `data:image/png;base64,${Buffer.alloc(600 * 1024).toString("base64")}` }),
    ).rejects.toMatchObject({ message: "Logo paling besar 512 KB." });

    await removeLogo(prisma);
    await expect(readBranding(prisma)).resolves.toMatchObject({ logoVersion: null });
  });
});
