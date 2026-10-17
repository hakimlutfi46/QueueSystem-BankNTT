import "dotenv/config";
import * as argon2 from "argon2";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

test("an account with a temporary password must change it before opening the counter", async ({ page }) => {
  const username = `uji.sandi.${Date.now()}`;
  await sql(
    `INSERT INTO users (username, name, password_hash, role, must_change_password) VALUES ($1, 'Uji Sandi', $2, 'STAFF', true)`,
    [username, await argon2.hash("Sementara-1")],
  );
  try {
    await signIn(page, username, "Sementara-1");
    await expect(page).toHaveURL(/\/account\/password/);
    await expect(page.getByTestId("password-required")).toBeVisible();

    // Loket dan API loket tertutup sampai sandi diganti.
    await page.goto("/counter");
    await expect(page).toHaveURL(/\/account\/password\?next=%2Fcounter/);
    const api = await page.request.get("/api/counters/mine");
    expect(api.status()).toBe(401);

    await page.getByLabel("Kata sandi sekarang").fill("salah-sekali");
    await page.getByLabel("Kata sandi baru", { exact: true }).fill("Kupang-Lobi-2026");
    await page.getByLabel("Ulangi kata sandi baru").fill("Kupang-Lobi-2026");
    await page.getByRole("button", { name: "Simpan kata sandi baru" }).click();
    await expect(page.getByRole("alert")).toHaveText(/Kata sandi sekarang salah/);

    await page.getByLabel("Kata sandi sekarang").fill("Sementara-1");
    await page.getByLabel("Kata sandi baru", { exact: true }).fill("Password123");
    await page.getByLabel("Ulangi kata sandi baru").fill("Password123");
    await page.getByRole("button", { name: "Simpan kata sandi baru" }).click();
    await expect(page.getByRole("alert")).toHaveText(/mudah ditebak/);

    await page.getByLabel("Kata sandi sekarang").fill("Sementara-1");
    await page.getByLabel("Kata sandi baru", { exact: true }).fill("Kupang-Lobi-2026");
    await page.getByLabel("Ulangi kata sandi baru").fill("Kupang-Lobi-2026");
    await page.getByRole("button", { name: "Simpan kata sandi baru" }).click();
    await expect(page).toHaveURL(/\/counter$/);
    await expect(page.getByTestId("password-required")).toHaveCount(0);
  } finally {
    await sql(`DELETE FROM users WHERE username = $1`, [username]);
  }
});

test("repeated wrong passwords lock the sign-in for that account for a while", async ({ page }) => {
  const username = `tidak.ada.${Date.now()}`;
  await page.goto("/login");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByLabel("Nama pengguna").fill(username);
    await page.getByLabel("Kata sandi").fill(`salah-${attempt}`);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByRole("alert")).toHaveText(/salah/);
  }
  await page.getByLabel("Kata sandi").fill("salah-lagi");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("alert")).toHaveText(/Terlalu banyak percobaan yang salah\. Coba lagi dalam \d+ menit\./);
});

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

async function sql(text: string, values: unknown[]): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}
