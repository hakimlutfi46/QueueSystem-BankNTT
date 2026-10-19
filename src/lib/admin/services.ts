import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError, validationError } from "@/lib/admin/errors";
import { errorText, notifyQueue } from "@/lib/queue/sql";

const serviceBody = z.object({
  name: z.string().trim().min(1, "Nama layanan wajib diisi.").max(80, "Nama layanan paling panjang 80 karakter."),
  prefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{1,2}$/, "Huruf awalan harus 1–2 huruf A–Z, tanpa angka atau spasi.")
    .transform((value) => value.toUpperCase()),
  sortOrder: z
    .number({ error: "Urutan wajib diisi." })
    .int("Urutan harus bilangan bulat.")
    .min(0, "Urutan minimal 0.")
    .max(999, "Urutan paling besar 999."),
  isActive: z.boolean().optional(),
});

export type AdminService = {
  id: number;
  name: string;
  prefix: string;
  sortOrder: number;
  isActive: boolean;
};

export async function listServices(db: PrismaClient): Promise<AdminService[]> {
  const rows = await db.$queryRaw<
    { id: number; name: string; prefix: string; sort_order: number; is_active: boolean }[]
  >`
    SELECT id, name, prefix, sort_order, is_active
    FROM services
    ORDER BY sort_order, id
  `;
  return rows.map(mapService);
}

export async function createService(db: PrismaClient, body: unknown): Promise<AdminService> {
  const parsed = serviceBody.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: number; name: string; prefix: string; sort_order: number; is_active: boolean }[]
      >`
        INSERT INTO services (name, prefix, sort_order, is_active)
        VALUES (${parsed.data.name}, ${parsed.data.prefix}, ${parsed.data.sortOrder}, ${parsed.data.isActive ?? true})
        RETURNING id, name, prefix, sort_order, is_active
      `;
      const service = rows[0];
      if (!service) throw new AdminError("VALIDATION", "Data tidak valid.");
      await notifyQueue(tx, { type: "CONFIG_CHANGED", serviceId: service.id });
      return mapService(service);
    });
  } catch (error) {
    if (errorText(error).includes("services_prefix_key")) {
      throw new AdminError("PREFIX_TAKEN", "Huruf awalan sudah dipakai.");
    }
    throw error;
  }
}

export async function updateService(db: PrismaClient, id: number, body: unknown): Promise<AdminService> {
  const parsed = serviceBody.partial().safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  if (Object.keys(parsed.data).length === 0) throw new AdminError("VALIDATION", "Tidak ada yang diubah.");
  const current = await listServices(db);
  const existing = current.find((service) => service.id === id);
  if (!existing) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
  const next = {
    name: parsed.data.name ?? existing.name,
    prefix: parsed.data.prefix ?? existing.prefix,
    sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
    isActive: parsed.data.isActive ?? existing.isActive,
  };
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: number; name: string; prefix: string; sort_order: number; is_active: boolean }[]
      >`
        UPDATE services
        SET name = ${next.name}, prefix = ${next.prefix}, sort_order = ${next.sortOrder}, is_active = ${next.isActive}
        WHERE id = ${id}
        RETURNING id, name, prefix, sort_order, is_active
      `;
      const service = rows[0];
      if (!service) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
      await notifyQueue(tx, { type: "CONFIG_CHANGED", serviceId: id });
      return mapService(service);
    });
  } catch (error) {
    if (error instanceof AdminError) throw error;
    if (errorText(error).includes("services_prefix_key")) {
      throw new AdminError("PREFIX_TAKEN", "Huruf awalan sudah dipakai.");
    }
    throw error;
  }
}

export async function deleteService(db: PrismaClient, id: number): Promise<void> {
  const current = await listServices(db);
  const existing = current.find((service) => service.id === id);
  if (!existing) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");

  const activeTickets = await db.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM tickets
    WHERE service_id = ${id} AND status IN ('WAITING', 'SERVING')
  `;
  if ((activeTickets[0]?.count ?? 0) > 0) {
    throw new AdminError("SERVICE_BUSY", "Layanan masih memiliki antrian aktif hari ini. Selesaikan antrian terlebih dahulu.");
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM counter_services WHERE service_id = ${id}`;
    await tx.$executeRaw`DELETE FROM daily_sequences WHERE service_id = ${id}`;
    await tx.$executeRaw`
      DELETE FROM ticket_events
      WHERE ticket_id IN (SELECT id FROM tickets WHERE service_id = ${id})
    `;
    await tx.$executeRaw`DELETE FROM tickets WHERE service_id = ${id}`;
    await tx.$executeRaw`DELETE FROM services WHERE id = ${id}`;
    await notifyQueue(tx, { type: "CONFIG_CHANGED", serviceId: id });
  });
}


function mapService(row: {
  id: number;
  name: string;
  prefix: string;
  sort_order: number;
  is_active: boolean;
}): AdminService {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

const serviceCountersBody = z.object({
  counterIds: z.array(
    z.number({ error: "Nomor loket tidak valid." }).int("Nomor loket tidak valid.").positive("Nomor loket tidak valid."),
    { error: "Daftar loket wajib diisi." },
  ),
});

/** Daftar loket yang melayani tiap layanan, dikunci dengan id layanan. */
export async function listServiceCounters(db: PrismaClient): Promise<Map<number, number[]>> {
  const rows = await db.$queryRaw<{ service_id: number; counter_id: number }[]>`
    SELECT service_id, counter_id FROM counter_services ORDER BY service_id, counter_id
  `;
  const result = new Map<number, number[]>();
  for (const row of rows) {
    const current = result.get(row.service_id) ?? [];
    current.push(row.counter_id);
    result.set(row.service_id, current);
  }
  return result;
}

/**
 * Mengganti loket aktif yang melayani satu layanan. Tautan ke loket nonaktif dibiarkan.
 * Semua baris yang terlibat dikunci dulu (layanan, lalu loket berurutan id) supaya dua admin
 * yang menyimpan bersamaan tidak bisa membuat satu loket tanpa layanan sama sekali.
 */
export async function setServiceCounters(
  db: PrismaClient,
  serviceId: number,
  body: unknown,
): Promise<{ serviceId: number; counterIds: number[] }> {
  const parsed = serviceCountersBody.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const wanted = [...new Set(parsed.data.counterIds)].sort((a, b) => a - b);

  return db.$transaction(async (tx) => {
    const service = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM services WHERE id = ${serviceId} FOR UPDATE
    `;
    if (!service[0]) throw new AdminError("NOT_FOUND", "Layanan tidak ditemukan.");

    // Kunci semua loket yang terlibat dengan urutan id naik agar tidak terjadi deadlock.
    // Diulang bila tautan berubah sebelum kunci didapat (misalnya dari menu Loket).
    const locked = new Map<number, { id: number; name: string; is_active: boolean }>();
    for (;;) {
      const linked = await linkedCounterIds(tx, serviceId);
      const pending = [...new Set([...wanted, ...linked])]
        .filter((id) => !locked.has(id))
        .sort((a, b) => a - b);
      if (pending.length === 0) break;
      for (const id of pending) {
        const rows = await tx.$queryRaw<{ id: number; name: string; is_active: boolean }[]>`
          SELECT id, name, is_active FROM counters WHERE id = ${id} FOR UPDATE
        `;
        const counter = rows[0];
        if (!counter) {
          if (wanted.includes(id)) throw new AdminError("VALIDATION", "Loket yang dipilih tidak ditemukan. Muat ulang halaman.");
          continue;
        }
        locked.set(id, counter);
      }
      if (wanted.some((id) => !locked.has(id))) {
        throw new AdminError("VALIDATION", "Loket yang dipilih tidak ditemukan. Muat ulang halaman.");
      }
    }

    for (const id of wanted) {
      const counter = locked.get(id);
      if (!counter) throw new AdminError("VALIDATION", "Loket yang dipilih tidak ditemukan. Muat ulang halaman.");
      if (!counter.is_active) {
        throw new AdminError("VALIDATION", `${counter.name} sedang nonaktif. Aktifkan dulu di menu Loket.`);
      }
    }

    const current = await linkedCounterIds(tx, serviceId);
    const toRemove = current.filter((id) => !wanted.includes(id) && locked.get(id)?.is_active);
    const toAdd = wanted.filter((id) => !current.includes(id));

    for (const id of toRemove) {
      const others = await tx.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total
        FROM counter_services
        WHERE counter_id = ${id} AND service_id <> ${serviceId}
      `;
      if ((others[0]?.total ?? 0) === 0) {
        const name = locked.get(id)?.name ?? "Loket";
        throw new AdminError(
          "COUNTER_LAST_SERVICE",
          `${name} tidak punya layanan lain. Tambahkan layanan lain ke ${name} dulu di menu Loket.`,
        );
      }
    }

    for (const id of toRemove) {
      await tx.$executeRaw`DELETE FROM counter_services WHERE counter_id = ${id} AND service_id = ${serviceId}`;
    }
    for (const id of toAdd) {
      await tx.$executeRaw`
        INSERT INTO counter_services (counter_id, service_id)
        VALUES (${id}, ${serviceId})
        ON CONFLICT DO NOTHING
      `;
    }
    await notifyQueue(tx, { type: "COUNTER_CHANGED", serviceId });
    return { serviceId, counterIds: await linkedCounterIds(tx, serviceId) };
  });
}

async function linkedCounterIds(tx: { $queryRaw: PrismaClient["$queryRaw"] }, serviceId: number): Promise<number[]> {
  const rows = await tx.$queryRaw<{ counter_id: number }[]>`
    SELECT counter_id FROM counter_services WHERE service_id = ${serviceId} ORDER BY counter_id
  `;
  return rows.map((row) => row.counter_id);
}
