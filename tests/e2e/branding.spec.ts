import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

test.describe.configure({ mode: "serial" });

type Row = { key: string; value: unknown };
let saved: Row[] = [];

test.beforeAll(async () => {
  saved = await query<Row>(`SELECT key, value FROM settings WHERE key IN ('org_name', 'org_tagline')`);
});

test.afterAll(async () => {
  await query(`DELETE FROM settings WHERE key IN ('org_name', 'org_tagline')`);
  for (const row of saved) {
    await query(`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)`, [row.key, JSON.stringify(row.value)]);
  }
});

test("a new organisation name and slogan show up on other screens", async ({ browser }) => {
  const stamp = Date.now();
  const orgName = `Bank Uji ${stamp}`;
  const tagline = `Slogan uji ${stamp}`;
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();

  await login(admin, "admin");
  await admin.goto("/admin/branding");
  await admin.getByLabel("Nama lembaga").fill(orgName);
  await admin.getByLabel("Slogan").fill(tagline);
  const save = admin.getByRole("button", { name: "Simpan identitas" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(admin.getByText("Identitas disimpan")).toBeVisible();

  const visitorContext = await browser.newContext();
  const home = await visitorContext.newPage();
  await home.goto("/");
  // Home passes no branch name, so the header falls back to the organisation name.
  await expect(home.getByText(orgName, { exact: true })).toBeVisible();
  await expect(home.getByText(tagline, { exact: true })).toBeVisible();
  await expect(home).toHaveTitle(new RegExp(orgName));

  await adminContext.close();
  await visitorContext.close();
});

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  await page.getByLabel("Kata sandi").fill("change-me");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}
