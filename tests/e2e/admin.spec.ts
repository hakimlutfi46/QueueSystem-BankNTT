import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await query(`
    UPDATE tickets
    SET status = 'DONE', finished_at = now(), auto_closed = true
    WHERE status = 'SERVING'
  `);
  await query(`UPDATE counters SET status = 'CLOSED', current_user_id = NULL`);
  await query(`UPDATE counters SET is_active = false WHERE name = 'CS Khusus'`);
});

test("a new counter appears on the officer screen and the TV without a reload", async ({ browser }) => {
  const displayContext = await browser.newContext();
  const officerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const display = await displayContext.newPage();
  const officer = await officerContext.newPage();
  const admin = await adminContext.newPage();

  await display.goto("/display");
  await login(officer, "petugas.cs");
  await expect(officer.getByRole("heading", { name: "Pilih loket" })).toBeVisible();
  await login(admin, "admin");
  await admin.goto("/admin/counters");
  await admin.getByLabel("Nama loket").fill("CS Khusus");
  await admin.getByLabel("Nomor tampil").fill("9");
  await admin.getByRole("checkbox", { name: "Customer Service" }).check();
  await admin.getByRole("button", { name: "Simpan loket" }).click();
  await expect(admin.getByText("CS Khusus").first()).toBeVisible();

  const openButton = officer.getByRole("button", { name: "Buka CS Khusus" });
  await expect(openButton).toBeVisible({ timeout: 8_000 });
  await openButton.click();
  await expect(display.getByText("CS Khusus")).toBeVisible({ timeout: 8_000 });

  await displayContext.close();
  await officerContext.close();
  await adminContext.close();
});

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  await page.getByLabel("Kata sandi").fill("change-me");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function query(sql: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
