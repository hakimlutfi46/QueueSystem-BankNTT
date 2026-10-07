import "dotenv/config";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

test("an admin can read the daily report and open the workbook", async ({ page, request }) => {
  const denied = await request.get("/api/reports/daily?date=2026-10-08");
  expect(denied.status()).toBe(401);

  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill("admin");
  await page.getByLabel("Kata sandi").fill("change-me");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/admin/reports/daily");
  await expect(page.getByRole("heading", { name: "Laporan harian" })).toBeVisible();
  await expect(page.getByText("Total tiket")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cetak" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Unduh Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^laporan-harian-.*\.xlsx$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const workbook = new ExcelJS.Workbook();
  const downloaded = await readFile(path as string);
  await workbook.xlsx.load(Uint8Array.from(downloaded).buffer);
  expect(workbook.getWorksheet("Ringkasan")).toBeTruthy();
  expect(workbook.getWorksheet("Rincian")).toBeTruthy();

  await page.getByRole("link", { name: "Rekap rentang" }).click();
  await expect(page.getByRole("heading", { name: "Rekap rentang tanggal" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Tanggal" })).toBeVisible();
});
