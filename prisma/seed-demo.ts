/**
 * Data contoh untuk mencoba aplikasi di laptop, meniru cabang yang hanya punya loket Teller dan
 * Customer Service: 8 layanan, 5 loket CS, 5 loket Teller, 10 petugas, dan satu supervisor, plus riwayat
 * tiket tujuh hari kerja terakhir supaya dasbor, laporan, dan grafik langsung terisi.
 *
 * Layanan, loket, dan akun contoh lama yang tidak ada di daftar ini dinonaktifkan, tidak dihapus,
 * supaya laporan lama tetap utuh. Layanan dengan awalan yang sama diberi nama baru.
 *
 * Jalankan setelah `npm run db:seed`: `npm run db:seed:demo`. Jangan dijalankan di server cabang.
 * Aman diulang: data yang sudah ada tidak digandakan, dan hari yang sudah punya tiket dilewati.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { getPrisma } from "../src/lib/db";
import { appTimezone } from "../src/lib/env";

/** Hari kerja riwayat tiket contoh. SEED_DEMO_HISTORY_DAYS=0 memasang layanan, loket, dan petugas tanpa riwayat. */
const HISTORY_DAYS = historyDays(process.env.SEED_DEMO_HISTORY_DAYS);

function historyDays(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 7;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0 || days > 60) {
    throw new Error("SEED_DEMO_HISTORY_DAYS harus bilangan bulat 0 sampai 60.");
  }
  return days;
}

/** Layanan teller singkat (2–6 menit), layanan CS lebih lama (6–20 menit). Urutan kiosk: paling ramai dulu. */
const SERVICES = [
  { prefix: "B", name: "Setor Tunai", sortOrder: 1, perDay: [90, 130], handle: [2, 5] },
  { prefix: "E", name: "Tarik Tunai", sortOrder: 2, perDay: [70, 100], handle: [2, 4] },
  { prefix: "F", name: "Transfer & Pembayaran", sortOrder: 3, perDay: [45, 70], handle: [3, 6] },
  { prefix: "D", name: "Pembukaan Rekening", sortOrder: 4, perDay: [10, 18], handle: [4, 6] },
  { prefix: "A", name: "Pengaduan Layanan", sortOrder: 5, perDay: [8, 14], handle: [10, 20] },
  { prefix: "G", name: "Kartu ATM & Mobile Banking", sortOrder: 6, perDay: [30, 45], handle: [6, 12] },
  { prefix: "C", name: "Informasi Produk & Kredit", sortOrder: 7, perDay: [20, 32], handle: [8, 18] },
  { prefix: "H", name: "Perubahan Data Nasabah", sortOrder: 8, perDay: [12, 20], handle: [6, 14] },
] as const;

const CS_SERVICES = ["A", "C", "G", "H"] as const;
const TELLER_SERVICES = ["B", "D", "E", "F"] as const;

/** Lima loket CS dan lima loket Teller. */
const COUNTERS = [
  ...[1, 2, 3, 4, 5].map((n) => ({ name: `CS ${n}`, displayNumber: n, services: CS_SERVICES })),
  ...[1, 2, 3, 4, 5].map((n) => ({ name: `Teller ${n}`, displayNumber: n, services: TELLER_SERVICES })),
];

/** Sepuluh petugas, satu per loket. */
const STAFF = [
  { username: "petugas.cs", name: "Maria Lodo", counter: "CS 1" },
  { username: "petugas.cs2", name: "Agustina Ndun", counter: "CS 2" },
  { username: "petugas.cs3", name: "Theresia Seran", counter: "CS 3" },
  { username: "petugas.cs4", name: "Margaretha Bili", counter: "CS 4" },
  { username: "petugas.cs5", name: "Elisabeth Nenobais", counter: "CS 5" },
  { username: "petugas.teller", name: "Fransiskus Lake", counter: "Teller 1" },
  { username: "petugas.teller2", name: "Debora Tefa", counter: "Teller 2" },
  { username: "petugas.teller3", name: "Yosef Manek", counter: "Teller 3" },
  { username: "petugas.teller4", name: "Yohanes Bria", counter: "Teller 4" },
  { username: "petugas.teller5", name: "Paulus Koli", counter: "Teller 5" },
] as const;

/** Akun contoh dari versi sebelumnya yang sekarang dinonaktifkan. */
const RETIRED_STAFF = ["petugas.kredit", "petugas.cadangan1", "petugas.cadangan2"];

/** Bobot kedatangan per jam, 08.00 sampai 15.00: ramai pagi menjelang siang. */
const HOUR_WEIGHTS: Record<number, number> = { 8: 3, 9: 6, 10: 7, 11: 6, 12: 3, 13: 4, 14: 4, 15: 2 };
const CLOSING_MINUTE = 16 * 60;
const NO_SHOW_RATE = 0.04;

type Prisma = ReturnType<typeof getPrisma>;
type SimTicket = { prefix: string; created: number; seq: number };

async function main(): Promise<void> {
  const prisma = getPrisma();
  const password = process.env.SEED_STAFF_PASSWORD?.trim() || "Password123";
  const timeZone = appTimezone();

  const serviceIds = await seedServices(prisma);
  const userIds = await seedUsers(prisma, password);
  const counterIds = await seedCounters(prisma, serviceIds);
  const retiredCounters = await retireCounters(prisma, counterIds);
  const retiredUsers = await retireStaff(prisma);

  const todayRows = await prisma.$queryRaw<{ today: string }[]>`
    SELECT to_char((now() AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS today
  `;
  const today = todayRows[0]?.today;
  if (!today) throw new Error("Could not read today's date");

  let created = 0;
  for (const date of pastWorkingDays(today, HISTORY_DAYS)) {
    const existing = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM tickets WHERE service_date = ${date}::date
    `;
    if ((existing[0]?.count ?? 0) > 0) {
      console.log(`${date}: sudah ada tiket, dilewati`);
      continue;
    }
    const count = await seedDay(prisma, { date, timeZone, serviceIds, counterIds, userIds });
    created += count;
    console.log(`${date}: ${count} tiket`);
  }

  console.log(
    `Selesai: ${SERVICES.length} layanan, ${COUNTERS.length} loket, ${STAFF.length + 1} akun, ${created} tiket riwayat` +
      ` (dinonaktifkan: ${retiredCounters} loket lama, ${retiredUsers} akun lama).`,
  );
}

/** Upsert per awalan: nama dan urutan ikut daftar di atas. Layanan aktif lain dinonaktifkan, tidak dihapus. */
async function seedServices(prisma: Prisma): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const service of SERVICES) {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO services (name, prefix, sort_order, is_active)
      VALUES (${service.name}, ${service.prefix}, ${service.sortOrder}, true)
      ON CONFLICT (prefix) DO UPDATE
        SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = true
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error(`Could not seed service ${service.prefix}`);
    ids.set(service.prefix, id);
  }
  const off = await prisma.service.updateMany({
    where: { isActive: true, prefix: { notIn: SERVICES.map((service) => service.prefix) } },
    data: { isActive: false },
  });
  if (off.count > 0) console.log(`${off.count} layanan lama dinonaktifkan`);
  return ids;
}

/** Akun yang sudah ada tidak diganti kata sandinya; nama dan status aktif ikut daftar di atas. */
async function seedUsers(prisma: Prisma, password: string): Promise<Map<string, number>> {
  const hash = await argon2.hash(password);
  const accounts = [
    ...STAFF.map((staff) => ({ username: staff.username, name: staff.name, role: "STAFF" })),
    { username: "supervisor", name: "Supervisor Cabang", role: "ADMIN" },
  ];
  const ids = new Map<string, number>();
  for (const account of accounts) {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO users (username, name, password_hash, role)
      VALUES (${account.username}, ${account.name}, ${hash}, ${account.role}::user_role)
      ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username, name = EXCLUDED.name, is_active = true
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error(`Could not seed user ${account.username}`);
    ids.set(account.username, id);
  }
  return ids;
}

/** Sepuluh loket dengan layanan persis seperti daftar: tautan ke layanan lain dilepas. */
async function seedCounters(prisma: Prisma, serviceIds: Map<string, number>): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const counter of COUNTERS) {
    const existing = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM counters WHERE is_active AND lower(name) = lower(${counter.name}) ORDER BY id LIMIT 1
    `;
    let id = existing[0]?.id;
    if (!id) {
      const rows = await prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO counters (name, display_number) VALUES (${counter.name}, ${counter.displayNumber}) RETURNING id
      `;
      id = rows[0]?.id;
    }
    if (!id) throw new Error(`Could not seed counter ${counter.name}`);
    const wanted = counter.services.map((prefix) => {
      const serviceId = serviceIds.get(prefix);
      if (!serviceId) throw new Error(`Unknown service prefix ${prefix}`);
      return serviceId;
    });
    await prisma.counterService.deleteMany({ where: { counterId: id, serviceId: { notIn: wanted } } });
    for (const serviceId of wanted) {
      await prisma.$executeRaw`
        INSERT INTO counter_services (counter_id, service_id) VALUES (${id}, ${serviceId})
        ON CONFLICT DO NOTHING
      `;
    }
    ids.set(counter.name, id);
  }
  return ids;
}

/** Loket aktif lain (misalnya "Kredit 1") ditutup lalu dinonaktifkan, kecuali sedang melayani tiket. */
async function retireCounters(prisma: Prisma, counterIds: Map<string, number>): Promise<number> {
  const keep = [...counterIds.values()];
  const others = await prisma.counter.findMany({
    where: { isActive: true, id: { notIn: keep } },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  let retired = 0;
  for (const counter of others) {
    const serving = await prisma.ticket.count({ where: { counterId: counter.id, status: "SERVING" } });
    if (serving > 0) {
      console.warn(`Peringatan: loket ${counter.name} sedang melayani tiket, tidak dinonaktifkan`);
      continue;
    }
    await prisma.counter.update({
      where: { id: counter.id },
      data: { status: "CLOSED", currentUserId: null, isActive: false },
    });
    retired += 1;
  }
  return retired;
}

/**
 * Akun contoh lama dinonaktifkan. Loket yang masih dipegangnya dan tidak sedang melayani tiket dilepas dulu;
 * bila masih memegang loket yang buka atau jeda, akun itu dibiarkan aktif.
 */
async function retireStaff(prisma: Prisma): Promise<number> {
  let retired = 0;
  for (const username of RETIRED_STAFF) {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true, isActive: true } });
    if (!user?.isActive) continue;
    await prisma.$executeRaw`
      UPDATE counters c SET status = 'CLOSED', current_user_id = NULL
      WHERE c.current_user_id = ${user.id}
        AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.counter_id = c.id AND t.status = 'SERVING')
    `;
    const holding = await prisma.counter.count({
      where: { currentUserId: user.id, status: { in: ["OPEN", "PAUSED"] } },
    });
    if (holding > 0) {
      console.warn(`Peringatan: ${username} masih memegang loket yang buka, tidak dinonaktifkan`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    retired += 1;
  }
  return retired;
}

/**
 * Satu hari antrian: tiket datang mengikuti bobot jam, lalu tiap tiket dipanggil loket yang paling cepat
 * kosong di antara loket yang melayani layanannya. Tiket yang belum terpanggil saat tutup menjadi EXPIRED.
 */
async function seedDay(
  prisma: Prisma,
  input: {
    date: string;
    timeZone: string;
    serviceIds: Map<string, number>;
    counterIds: Map<string, number>;
    userIds: Map<string, number>;
  },
): Promise<number> {
  const random = rng(hash(input.date));
  const tickets: SimTicket[] = [];
  for (const service of SERVICES) {
    const count = between(random, service.perDay[0], service.perDay[1]);
    const times = Array.from({ length: count }, () => arrivalMinute(random)).sort((left, right) => left - right);
    times.forEach((created, index) => tickets.push({ prefix: service.prefix, created, seq: index + 1 }));
  }
  tickets.sort((left, right) => left.created - right.created || left.prefix.localeCompare(right.prefix));

  const freeAt = new Map<string, number>(COUNTERS.map((counter) => [counter.name, 8 * 60]));
  const local = (minute: number) => `${input.date} ${clock(minute)}`;

  await prisma.$transaction(async (tx) => {
    for (const ticket of tickets) {
      const service = SERVICES.find((item) => item.prefix === ticket.prefix);
      const serviceId = input.serviceIds.get(ticket.prefix);
      if (!service || !serviceId) continue;
      const number = `${ticket.prefix}${String(ticket.seq).padStart(3, "0")}`;

      const desk = COUNTERS.filter((counter) => (counter.services as readonly string[]).includes(ticket.prefix))
        .map((counter) => ({ counter, free: freeAt.get(counter.name) ?? 0 }))
        .sort((left, right) => left.free - right.free)[0];
      const called = Math.max(ticket.created + 1, desk?.free ?? ticket.created) + random() * 1.5;
      const expired = !desk || called >= CLOSING_MINUTE;

      let status = "EXPIRED";
      let finished: number | null = null;
      if (!expired && desk) {
        const noShow = random() < NO_SHOW_RATE;
        finished = called + (noShow ? 2 + random() : between(random, service.handle[0], service.handle[1]) + random());
        status = noShow ? "NO_SHOW" : "DONE";
        freeAt.set(desk.counter.name, finished + 0.5);
      }
      const counterId = expired || !desk ? null : (input.counterIds.get(desk.counter.name) ?? null);
      const officer = desk ? STAFF.find((staff) => staff.counter === desk.counter.name) : undefined;
      const userId = expired || !officer ? null : (input.userIds.get(officer.username) ?? null);

      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO tickets (
          request_id, service_id, service_date, seq, number, status, counter_id, served_by,
          call_count, created_at, called_at, finished_at
        )
        VALUES (
          ${randomUUID()}::uuid, ${serviceId}, ${input.date}::date, ${ticket.seq}, ${number},
          ${status}::ticket_status, ${counterId}, ${userId}, ${expired ? 0 : status === "NO_SHOW" ? 3 : 1},
          (${local(ticket.created)}::timestamp AT TIME ZONE ${input.timeZone}),
          ${expired ? null : local(called)}::timestamp AT TIME ZONE ${input.timeZone},
          ${finished == null ? null : local(finished)}::timestamp AT TIME ZONE ${input.timeZone}
        )
        RETURNING id::text AS id
      `;
      const ticketId = rows[0]?.id;
      if (!ticketId) continue;

      const events: Array<{ type: string; minute: number; withDesk: boolean }> = [
        { type: "ISSUED", minute: ticket.created, withDesk: false },
      ];
      if (expired) {
        events.push({ type: "EXPIRED", minute: CLOSING_MINUTE + 60, withDesk: false });
      } else {
        events.push({ type: "CALLED", minute: called, withDesk: true });
        if (status === "NO_SHOW") {
          events.push({ type: "RECALLED", minute: called + 0.7, withDesk: true });
          events.push({ type: "RECALLED", minute: called + 1.4, withDesk: true });
        }
        events.push({ type: status, minute: finished ?? called, withDesk: true });
      }
      for (const event of events) {
        await tx.$executeRaw`
          INSERT INTO ticket_events (ticket_id, type, counter_id, user_id, created_at)
          VALUES (
            ${ticketId}::bigint, ${event.type},
            ${event.withDesk ? counterId : null}, ${event.withDesk ? userId : null},
            (${local(event.minute)}::timestamp AT TIME ZONE ${input.timeZone})
          )
        `;
      }
    }

    for (const service of SERVICES) {
      const last = tickets.filter((ticket) => ticket.prefix === service.prefix).length;
      const serviceId = input.serviceIds.get(service.prefix);
      if (last === 0 || !serviceId) continue;
      await tx.$executeRaw`
        INSERT INTO daily_sequences (service_id, service_date, last_number)
        VALUES (${serviceId}, ${input.date}::date, ${last})
        ON CONFLICT (service_id, service_date) DO NOTHING
      `;
    }
  }, { timeout: 60_000 });

  return tickets.length;
}

/** Hari kerja sebelum hari ini, terlama dulu. Minggu dilewati karena cabang tutup. */
function pastWorkingDays(today: string, count: number): string[] {
  const days: string[] = [];
  const cursor = new Date(`${today}T00:00:00Z`);
  while (days.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (cursor.getUTCDay() !== 0) days.push(cursor.toISOString().slice(0, 10));
  }
  return days.reverse();
}

function arrivalMinute(random: () => number): number {
  const entries = Object.entries(HOUR_WEIGHTS);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = random() * total;
  for (const [hour, weight] of entries) {
    pick -= weight;
    if (pick <= 0) return Number(hour) * 60 + random() * 60;
  }
  return 15 * 60 + random() * 60;
}

function clock(minute: number): string {
  const seconds = Math.round(minute * 60);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [hours, minutes, seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

function between(random: () => number, min: number, max: number): number {
  return Math.floor(min + random() * (max - min + 1));
}

/** Pembangkit acak tetap (mulberry32), supaya data contoh sama setiap kali dijalankan. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
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
