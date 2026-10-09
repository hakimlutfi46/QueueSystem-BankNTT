import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Sesi database selalu UTC. Adapter Prisma membuang offset zona waktu saat membaca timestamptz dari
 * query mentah, jadi pada server PostgreSQL ber-TimeZone Asia/Jakarta setiap waktu maju 7 jam (tiket
 * tercetak 22.31 padahal 15.31). Dengan sesi UTC tidak ada offset yang hilang. Tanggal dan jam cabang
 * tetap dihitung dengan zona eksplisit (AT TIME ZONE), bukan zona sesi.
 */
export const DB_SESSION_OPTIONS = "-c TimeZone=UTC";

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString, options: DB_SESSION_OPTIONS });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrisma();
  return globalForPrisma.prisma;
}
