import { execSync } from "node:child_process";
import { Client, Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DB_SESSION_OPTIONS } from "@/lib/db";

export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL is not set");
  }
  const url = new URL(base);
  url.pathname = "/queue_test";
  return url.toString();
}

export async function ensureTestDatabase(): Promise<string> {
  const databaseUrl = testDatabaseUrl();
  const admin = new URL(databaseUrl);
  const database = admin.pathname.replace(/^\//, "");
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) {
    throw new Error("Unsafe test database name");
  }
  admin.pathname = "/postgres";

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  return databaseUrl;
}

export function createTestPrisma(databaseUrl: string): { prisma: PrismaClient; pool: Pool } {
  const pool = new Pool({ connectionString: databaseUrl, max: 30, options: DB_SESSION_OPTIONS });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}
