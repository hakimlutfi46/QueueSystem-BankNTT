import "dotenv/config";
import argon2 from "argon2";
import { getPrisma } from "../src/lib/db";

type SettingValue = string | number | boolean;

// Nama lembaga untuk data awal. Isi SEED_ORG_NAME bila aplikasi dipasang untuk lembaga selain Bank NTT.
const ORG_NAME = process.env.SEED_ORG_NAME?.trim() || "Bank NTT";

const SETTINGS: Array<{ key: string; value: SettingValue }> = [
  { key: "org_name", value: ORG_NAME },
  { key: "branch_name", value: ORG_NAME },
  { key: "running_text", value: `Selamat datang di ${ORG_NAME}` },
  { key: "voice_enabled", value: true },
  { key: "max_recall", value: 3 },
  { key: "target_service_minutes", value: 10 },
  { key: "ticket_footer", value: "Simpan tiket sampai nomor Anda dipanggil." },
  { key: "ticket_width_mm", value: 80 },
];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function main(): Promise<void> {
  const prisma = getPrisma();
  const adminPassword = requiredEnv("SEED_ADMIN_PASSWORD");
  const staffPassword = requiredEnv("SEED_STAFF_PASSWORD");

  const customerService = await prisma.service.upsert({
    where: { prefix: "A" },
    create: { name: "Customer Service", prefix: "A", sortOrder: 1 },
    update: {},
  });
  const teller = await prisma.service.upsert({
    where: { prefix: "B" },
    create: { name: "Teller", prefix: "B", sortOrder: 2 },
    update: {},
  });

  const adminHash = await argon2.hash(adminPassword);
  const staffHash = await argon2.hash(staffPassword);

  await prisma.user.upsert({
    where: { username: "admin" },
    create: {
      username: "admin",
      name: "Admin",
      passwordHash: adminHash,
      role: "ADMIN",
    },
    update: {},
  });
  await prisma.user.upsert({
    where: { username: "petugas.cs" },
    create: {
      username: "petugas.cs",
      name: "Petugas CS",
      passwordHash: staffHash,
      role: "STAFF",
    },
    update: {},
  });
  await prisma.user.upsert({
    where: { username: "petugas.teller" },
    create: {
      username: "petugas.teller",
      name: "Petugas Teller",
      passwordHash: staffHash,
      role: "STAFF",
    },
    update: {},
  });

  const servicesByPrefix = new Map([
    [customerService.prefix, customerService.id],
    [teller.prefix, teller.id],
  ]);

  const counters = [
    { name: "CS 1", displayNumber: 1, servicePrefix: "A" },
    { name: "CS 2", displayNumber: 2, servicePrefix: "A" },
    { name: "Teller 1", displayNumber: 1, servicePrefix: "B" },
    { name: "Teller 2", displayNumber: 2, servicePrefix: "B" },
  ];

  for (const counter of counters) {
    const serviceId = servicesByPrefix.get(counter.servicePrefix);
    if (!serviceId) {
      throw new Error(`Unknown service prefix ${counter.servicePrefix}`);
    }

    const existing = await prisma.counter.findFirst({
      where: { name: counter.name },
      select: { id: true },
    });
    const counterId = existing
      ? existing.id
      : (
          await prisma.counter.create({
            data: {
              name: counter.name,
              displayNumber: counter.displayNumber,
            },
            select: { id: true },
          })
        ).id;

    await prisma.counterService.upsert({
      where: {
        counterId_serviceId: { counterId, serviceId },
      },
      create: { counterId, serviceId },
      update: {},
    });
  }

  for (const setting of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: setting,
      update: {},
    });
  }
}

main()
  .then(async () => {
    await getPrisma().$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await getPrisma().$disconnect();
    process.exit(1);
  });
