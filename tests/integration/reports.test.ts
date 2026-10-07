import "dotenv/config";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { appTimezone } from "@/lib/env";
import { exportReport } from "@/lib/reports/export";
import { loadDailyReport, loadRangeReport } from "@/lib/reports/query";
import { createTestPrisma, ensureTestDatabase } from "./database";

let prisma: PrismaClient;
let pool: { end: () => Promise<void> };
let serviceId = 0;
let counterId = 0;
let userId = 0;

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
  await prisma.$executeRaw`
    TRUNCATE TABLE
      ticket_events,
      tickets,
      daily_sequences,
      counter_services,
      counters,
      users,
      services,
      settings
    RESTART IDENTITY CASCADE
  `;
  const services = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO services (name, prefix, sort_order)
    VALUES ('Customer Service', 'A', 1)
    RETURNING id
  `;
  const users = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO users (username, name, password_hash, role)
    VALUES ('petugas.uji', 'Petugas Uji', 'not-used', 'STAFF')
    RETURNING id
  `;
  const counters = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO counters (name, display_number)
    VALUES ('CS 1', 1)
    RETURNING id
  `;
  serviceId = Number(services[0]?.id);
  userId = Number(users[0]?.id);
  counterId = Number(counters[0]?.id);
});

describe("daily and range reports", () => {
  it("matches a hand count and leaves automatic closures out of the averages", async () => {
    expect(appTimezone()).toBe("Asia/Makassar");
    await insertDone("A001", 1, "2026-10-08T01:00:00+08:00", "2026-10-08T01:01:00+08:00", "2026-10-08T01:02:30+08:00", false);
    await insertDone("A002", 2, "2026-10-08T02:00:00+08:00", "2026-10-08T02:10:00+08:00", "2026-10-08T04:56:40+08:00", true);
    await prisma.$executeRaw`
      INSERT INTO tickets (
        request_id, service_id, service_date, seq, number, status,
        counter_id, served_by, call_count, auto_closed, created_at, called_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${serviceId},
        '2026-10-08',
        3,
        'A003',
        'NO_SHOW',
        ${counterId},
        ${userId},
        2,
        false,
        ${"2026-10-08T03:00:00+08:00"}::timestamptz,
        ${"2026-10-08T03:00:30+08:00"}::timestamptz
      )
    `;

    const report = await loadDailyReport(prisma, "2026-10-08");
    expect(report.totals).toMatchObject({
      total: 3,
      done: 2,
      noShow: 1,
      expired: 0,
      wait: { averageSeconds: 45, maxSeconds: 600 },
      handle: { averageSeconds: 90, maxSeconds: 10000 },
    });
    expect(report.services[0]).toMatchObject({ serviceName: "Customer Service", total: 3 });
    expect(report.counters[0]).toMatchObject({ counterName: "CS 1", officerName: "Petugas Uji", total: 3 });
    expect(report.hours.find((bucket) => bucket.hour === 1)?.count).toBe(1);
    expect(report.hours.find((bucket) => bucket.hour === 17)?.count).toBe(0);
    expect(report.tickets.map((ticket) => ticket.number)).toEqual(["A001", "A002", "A003"]);
    expect(report.tickets[0]).toMatchObject({
      createdAt: "01:00:00",
      waitSeconds: 60,
      handleSeconds: 90,
      autoClosed: false,
    });
    expect(report.tickets[1]?.autoClosed).toBe(true);

    const workbookFile = await exportReport(prisma, new URLSearchParams({ date: "2026-10-08", format: "xlsx" }));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBytes(workbookFile.body));
    expect(workbook.getWorksheet("Ringkasan")?.getCell("B2").value).toBe(3);
    expect(workbook.getWorksheet("Rincian")?.getCell("A2").value).toBe("A001");
    expect(workbook.getWorksheet("Rincian")?.getCell("I2").value).toBe(60);
    expect(String(workbook.getWorksheet("Rincian")?.getCell("M3").value)).toContain("tutup otomatis");

    const csv = (await exportReport(prisma, new URLSearchParams({ date: "2026-10-08", format: "csv" }))).body.toString("utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("00:45");
    expect(csv).toContain("01:30");
    expect(csv).toContain("A001");
  });

  it("builds one row per day and averages across tickets", async () => {
    await insertDone("A001", 1, "2026-10-07T09:00:00+08:00", "2026-10-07T09:02:00+08:00", "2026-10-07T09:03:00+08:00", false, "2026-10-07");
    await insertDone("A001", 1, "2026-10-09T09:00:00+08:00", "2026-10-09T09:00:10+08:00", "2026-10-09T09:00:30+08:00", false, "2026-10-09");
    await prisma.$executeRaw`
      INSERT INTO tickets (request_id, service_id, service_date, seq, number, status, created_at)
      VALUES (
        ${randomUUID()}::uuid,
        ${serviceId},
        '2026-10-09',
        2,
        'A002',
        'EXPIRED',
        ${"2026-10-09T10:00:00+08:00"}::timestamptz
      )
    `;

    const report = await loadRangeReport(prisma, "2026-10-07", "2026-10-09");
    expect(report.days.map((day) => day.date)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(report.days[1]).toMatchObject({ total: 0, wait: { averageSeconds: null }, handle: { averageSeconds: null } });
    expect(report.totals).toMatchObject({
      total: 3,
      done: 2,
      noShow: 0,
      expired: 1,
      wait: { averageSeconds: 65, maxSeconds: 120 },
      handle: { averageSeconds: 40, maxSeconds: 60 },
    });

    const workbookFile = await exportReport(prisma, new URLSearchParams({
      from: "2026-10-07",
      to: "2026-10-09",
      format: "xlsx",
    }));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBytes(workbookFile.body));
    expect(workbook.getWorksheet("Rekap")?.getCell("A2").value).toBe("Rentang");
    expect(workbook.getWorksheet("Rekap")?.getCell("B2").value).toBe(3);
  });
});

function workbookBytes(body: Buffer): ArrayBuffer {
  return Uint8Array.from(body).buffer;
}

async function insertDone(
  number: string,
  seq: number,
  createdAt: string,
  calledAt: string,
  finishedAt: string,
  autoClosed: boolean,
  serviceDate = "2026-10-08",
) {
  await prisma.$executeRaw`
    INSERT INTO tickets (
      request_id, service_id, service_date, seq, number, status,
      counter_id, served_by, call_count, auto_closed, created_at, called_at, finished_at
    )
    VALUES (
      ${randomUUID()}::uuid,
      ${serviceId},
      ${serviceDate}::date,
      ${seq},
      ${number},
      'DONE',
      ${counterId},
      ${userId},
      1,
      ${autoClosed},
      ${createdAt}::timestamptz,
      ${calledAt}::timestamptz,
      ${finishedAt}::timestamptz
    )
  `;
}
