/**
 * Data contoh untuk mencoba aplikasi di laptop: 3 loket CS, 4 loket Teller, 1 loket Kredit, 10 petugas,
 * dan satu supervisor, plus riwayat tiket
 * tujuh hari kerja terakhir supaya dasbor, laporan, dan grafik langsung terisi.
 *
 * Jalankan setelah `npm run db:seed`: `npm run db:seed:demo`. Jangan dijalankan di server cabang.
 * Aman diulang: data yang sudah ada tidak digandakan, dan hari yang sudah punya tiket dilewati.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { getPrisma } from "../src/lib/db";
import { appTimezone } from "../src/lib/env";

const HISTORY_DAYS = 7;

const SERVICES = [
  { prefix: "A", name: "Customer Service", sortOrder: 1, perDay: [28, 45], handle: [4, 12] },
  { prefix: "B", name: "Teller", sortOrder: 2, perDay: [55, 90], handle: [2, 6] },
  { prefix: "C", name: "Kredit", sortOrder: 3, perDay: [5, 12], handle: [10, 25] },
  { prefix: "D", name: "Pembukaan Rekening", sortOrder: 4, perDay: [6, 14], handle: [8, 18] },
] as const;

/** Sepuluh petugas: delapan bertugas tetap di riwayat contoh, dua cadangan untuk dicoba ditugaskan. */
const STAFF = [
  { username: "petugas.cs", name: "Petugas CS", counter: "CS 1" },
  { username: "petugas.cs2", name: "Maria Lodo", counter: "CS 2" },
  { username: "petugas.cs3", name: "Agustina Ndun", counter: "CS 3" },
  { username: "petugas.teller", name: "Petugas Teller", counter: "Teller 1" },
  { username: "petugas.teller2", name: "Fransiskus Lake", counter: "Teller 2" },
  { username: "petugas.teller3", name: "Debora Tefa", counter: "Teller 3" },
  { username: "petugas.teller4", name: "Yosef Manek", counter: "Teller 4" },
  { username: "petugas.kredit", name: "Yohanes Bria", counter: "Kredit 1" },
  { username: "petugas.cadangan1", name: "Theresia Seran", counter: null },
  { username: "petugas.cadangan2", name: "Paulus Koli", counter: null },
] as const;

/** Tiga loket CS dan empat loket Teller, ditambah satu loket Kredit. */
const COUNTERS = [
  { name: "CS 1", displayNumber: 1, services: ["A"] },
  { name: "CS 2", displayNumber: 2, services: ["A"] },
  { name: "CS 3", displayNumber: 3, services: ["A", "D"] },
  { name: "Teller 1", displayNumber: 1, services: ["B"] },
  { name: "Teller 2", displayNumber: 2, services: ["B"] },
  { name: "Teller 3", displayNumber: 3, services: ["B"] },
  { name: "Teller 4", displayNumber: 4, services: ["B"] },
  { name: "Kredit 1", displayNumber: 1, services: ["C"] },
] as const;

/** Bobot kedatangan per jam, 08.00 sampai 15.00: ramai pagi menjelang siang. */
const HOUR_WEIGHTS: Record<number, number> = { 8: 3, 9: 6, 10: 7, 11: 6, 12: 3, 13: 4, 14: 4, 15: 2 };
const CLOSING_MINUTE = 16 * 60;
const NO_SHOW_RATE = 0.04;

type Prisma = ReturnType<typeof getPrisma>;
type SimTicket = { prefix: string; created: number; seq: number };

async function main(): Promise<void> {
  const prisma = getPrisma();
  const password = process.env.SEED_STAFF_PASSWORD?.trim();
  if (!password) throw new Error("SEED_STAFF_PASSWORD is not set");
  const timeZone = appTimezone();

  const serviceIds = await seedServices(prisma);
  const userIds = await seedUsers(prisma, password);
  const counterIds = await seedCounters(prisma, serviceIds);

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
    `Selesai: ${SERVICES.length} layanan, ${COUNTERS.length} loket, ${STAFF.length + 1} akun, ${created} tiket riwayat.`,
  );
}

async function seedServices(prisma: Prisma): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const service of SERVICES) {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO services (name, prefix, sort_order)
      VALUES (${service.name}, ${service.prefix}, ${service.sortOrder})
      ON CONFLICT (prefix) DO UPDATE SET prefix = EXCLUDED.prefix
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error(`Could not seed service ${service.prefix}`);
    ids.set(service.prefix, id);
  }
  return ids;
}

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
      ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error(`Could not seed user ${account.username}`);
    ids.set(account.username, id);
  }
  return ids;
}

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
    for (const prefix of counter.services) {
      const serviceId = serviceIds.get(prefix);
      await prisma.$executeRaw`
        INSERT INTO counter_services (counter_id, service_id) VALUES (${id}, ${serviceId})
        ON CONFLICT DO NOTHING
      `;
    }
    ids.set(counter.name, id);
  }
  return ids;
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
