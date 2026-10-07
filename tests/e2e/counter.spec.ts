import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { ticketEndpoint } from "./device";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await query(`
    UPDATE tickets
    SET status = 'DONE', finished_at = now(), auto_closed = true
    WHERE status = 'SERVING'
  `);
  await query(`UPDATE counters SET status = 'CLOSED', current_user_id = NULL`);
});

test("two officers call different numbers", async ({ browser }) => {
  const serviceId = await serviceA();
  for (let index = 0; index < 4; index += 1) {
    const response = await fetch(ticketEndpoint(baseUrl()), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serviceId, requestId: randomUUID() }),
    });
    expect(response.ok).toBe(true);
  }

  const first = await browser.newContext();
  const second = await browser.newContext();
  const officerA = await first.newPage();
  const officerB = await second.newPage();
  await login(officerA, "petugas.cs");
  await login(officerB, "petugas.teller");
  await officerA.getByRole("button", { name: "Buka CS 1" }).click();
  await officerB.getByRole("button", { name: "Buka CS 2" }).click();
  await expect(officerA.getByRole("button", { name: "Panggil berikutnya" })).toBeEnabled();
  await expect(officerB.getByRole("button", { name: "Panggil berikutnya" })).toBeEnabled();

  const numbers = [
    await callNext(officerA),
    await callNext(officerB),
    await callNext(officerA),
    await callNext(officerB),
  ];
  expect(new Set(numbers).size).toBe(4);
  expect(numbers.every((number) => /^A\d+$/.test(number))).toBe(true);

  await first.close();
  await second.close();
});

test("a wrong password stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill("petugas.cs");
  await page.getByLabel("Kata sandi").fill("bukan-sandi");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByText("Nama pengguna atau kata sandi salah.")).toBeVisible();
});

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  await page.getByLabel("Kata sandi").fill("change-me");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("heading", { name: "Pilih loket" })).toBeVisible();
}

async function callNext(page: Page): Promise<string> {
  const number = page.getByTestId("active-number");
  const previous = (await number.count()) > 0 ? (await number.innerText()).trim() : "";
  const button = page.getByRole("button", { name: /panggil berikutnya/i });
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(async () => (await number.innerText()).trim()).not.toBe(previous);
  const text = (await number.innerText()).trim();
  expect(text).toMatch(/^A\d+$/);
  return text;
}

function baseUrl(): string {
  return "http://127.0.0.1:3000";
}

async function serviceA(): Promise<number> {
  const rows = await query<{ id: number }>("SELECT id FROM services WHERE prefix = 'A' LIMIT 1");
  const id = rows[0]?.id;
  if (!id) throw new Error("Service A is missing");
  return id;
}

async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<T>(sql);
    return result.rows;
  } finally {
    await client.end();
  }
}
