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
