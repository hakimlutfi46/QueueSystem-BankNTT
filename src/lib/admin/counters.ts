import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError } from "@/lib/admin/errors";
import { notifyQueue } from "@/lib/queue/sql";

const counterBody = z.object({
  name: z.string().trim().min(1).max(80),
  displayNumber: z.number().int().positive().max(999),
  serviceIds: z.array(z.number().int().positive()).min(1),
  isActive: z.boolean().optional(),
});

export type AdminCounter = {
  id: number;
  name: string;
  displayNumber: number;
  status: string;
  isActive: boolean;
  serviceIds: number[];
  officerName: string | null;
};

export async function listCounters(db: PrismaClient): Promise<AdminCounter[]> {
  const counters = await db.$queryRaw<
    {
      id: number;
      name: string;
      display_number: number;
      status: string;
      is_active: boolean;
      officer_name: string | null;
    }[]
  >`
    SELECT counter.id, counter.name, counter.display_number, counter.status::text AS status,
      counter.is_active, officer.name AS officer_name
    FROM counters AS counter
    LEFT JOIN users AS officer ON officer.id = counter.current_user_id
    ORDER BY counter.display_number, counter.id
  `;
  const links = await db.$queryRaw<{ counter_id: number; service_id: number }[]>`
    SELECT counter_id, service_id FROM counter_services ORDER BY service_id
  `;
  const services = new Map<number, number[]>();
  for (const link of links) {
    const current = services.get(link.counter_id) ?? [];
    current.push(link.service_id);
    services.set(link.counter_id, current);
  }
  return counters.map((counter) => ({
    id: counter.id,
    name: counter.name,
    displayNumber: counter.display_number,
    status: counter.status,
    isActive: counter.is_active,
    serviceIds: services.get(counter.id) ?? [],
    officerName: counter.officer_name,
  }));
}

export async function createCounter(db: PrismaClient, body: unknown): Promise<AdminCounter> {
  const parsed = counterBody.safeParse(body);
  if (!parsed.success) throw new AdminError("VALIDATION", "Data tidak valid.");
  const serviceIds = [...new Set(parsed.data.serviceIds)];
  return db.$transaction(async (tx) => {
    await assertServices(tx, serviceIds);
    const rows = await tx.$queryRaw<{ id: number }[]>`
      INSERT INTO counters (name, display_number)
      VALUES (${parsed.data.name}, ${parsed.data.displayNumber})
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (!id) throw new AdminError("VALIDATION", "Data tidak valid.");
    for (const serviceId of serviceIds) {
      await tx.$executeRaw`
        INSERT INTO counter_services (counter_id, service_id)
        VALUES (${id}, ${serviceId})
      `;
    }
    await notifyQueue(tx, { type: "COUNTER_CHANGED", counterId: id });
    const created = (await listCounters(tx as unknown as PrismaClient)).find((counter) => counter.id === id);
    if (!created) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
    return created;
  });
}

export async function updateCounter(db: PrismaClient, id: number, body: unknown): Promise<AdminCounter> {
  const parsed = counterBody.partial().safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    throw new AdminError("VALIDATION", "Data tidak valid.");
  }
  return db.$transaction(async (tx) => {
    const existing = (await listCounters(tx as unknown as PrismaClient)).find((counter) => counter.id === id);
    if (!existing) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
    if (parsed.data.isActive === false && (existing.status === "OPEN" || existing.status === "PAUSED")) {
      throw new AdminError("COUNTER_BUSY", "Tutup loket terlebih dahulu.");
    }
    const serviceIds = parsed.data.serviceIds ? [...new Set(parsed.data.serviceIds)] : existing.serviceIds;
    if (serviceIds.length === 0) throw new AdminError("VALIDATION", "Data tidak valid.");
    await assertServices(tx, serviceIds);
    await tx.$executeRaw`
      UPDATE counters
      SET name = ${parsed.data.name ?? existing.name},
        display_number = ${parsed.data.displayNumber ?? existing.displayNumber},
        is_active = ${parsed.data.isActive ?? existing.isActive}
      WHERE id = ${id}
    `;
    if (parsed.data.serviceIds) {
      await tx.$executeRaw`DELETE FROM counter_services WHERE counter_id = ${id}`;
      for (const serviceId of serviceIds) {
        await tx.$executeRaw`
          INSERT INTO counter_services (counter_id, service_id)
          VALUES (${id}, ${serviceId})
        `;
      }
    }
    await notifyQueue(tx, { type: "COUNTER_CHANGED", counterId: id });
    const updated = (await listCounters(tx as unknown as PrismaClient)).find((counter) => counter.id === id);
    if (!updated) throw new AdminError("NOT_FOUND", "Data tidak ditemukan.");
    return updated;
  });
}

async function assertServices(
  tx: { $queryRaw: PrismaClient["$queryRaw"] },
  serviceIds: number[],
): Promise<void> {
  for (const serviceId of serviceIds) {
    const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM services WHERE id = ${serviceId}`;
    if (!rows[0]) throw new AdminError("SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
  }
}
