import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { displayEntry, kioskEntry } from "./device";

test.beforeAll(async () => {
  await query(`
    UPDATE tickets
    SET status = 'DONE', finished_at = now(), auto_closed = true
    WHERE status = 'SERVING'
  `);
  await query(`UPDATE counters SET status = 'CLOSED', current_user_id = NULL`);
  await query(`UPDATE tickets SET status = 'EXPIRED' WHERE status = 'WAITING'`);
});

test("a ticket moves from the kiosk to the TV and then into the daily report", async ({ browser, request }) => {
  const tickets = await request.post("/api/tickets", {
    data: { serviceId: 1, requestId: "6f1e1b4a-9c2d-4e5f-8a7b-1c2d3e4f5a6b" },
  });
  expect(tickets.status()).toBe(401);

  const displayContext = await browser.newContext();
  const officerContext = await browser.newContext();
  const kioskContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const display = await displayContext.newPage();
  const officer = await officerContext.newPage();
  const kiosk = await kioskContext.newPage();
  const admin = await adminContext.newPage();

  await display.goto(displayEntry());
  await expect(display.getByRole("button", { name: "Aktifkan suara" })).toBeVisible();

  await login(officer, "petugas.cs");
  await officer.getByRole("button", { name: "Buka CS 1" }).click();
  await expect(officer.getByRole("button", { name: "Panggil berikutnya" })).toBeVisible();

  await kiosk.goto("/kiosk");
  await expect(kiosk.getByRole("heading", { name: "Perangkat belum diizinkan" })).toBeVisible();
  await kiosk.goto(kioskEntry());
  await expect(kiosk).not.toHaveURL(/token=/);
  await kiosk.getByRole("button", { name: /Customer Service/ }).click();
  const number = (await kiosk.locator("[data-ticket-id]").getByText(/^A\d{3}$/).innerText()).trim();
  expect(number).toMatch(/^A\d{3}$/);

  await expect(officer.getByRole("button", { name: "Panggil berikutnya" })).toBeEnabled();
  await officer.getByRole("button", { name: "Panggil berikutnya" }).click();
  await expect(display.getByTestId("last-call")).toContainText(number, { timeout: 2_000 });

  await officer.getByRole("button", { name: "Selesai tanpa memanggil" }).click();
  await expect(officer.getByTestId("active-number")).toHaveCount(0);

  await login(admin, "admin");
  await admin.goto("/admin/reports/daily");
  const row = admin.getByRole("row").filter({ hasText: number });
  await expect(row).toContainText("Selesai");
  const cells = row.getByRole("cell");
  await expect(cells.nth(7)).toHaveText(/^00:[0-5]\d$/);
  await expect(cells.nth(8)).toHaveText(/^00:[0-5]\d$/);

  await displayContext.close();
  await officerContext.close();
  await kioskContext.close();
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
