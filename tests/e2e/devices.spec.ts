import { expect, test, type Page } from "@playwright/test";

test("a registered kiosk opens with its link and loses access once revoked", async ({ browser }) => {
  const name = `Kiosk E2E ${Date.now()}`;
  const adminContext = await browser.newContext();
  const kioskContext = await browser.newContext();
  const tvContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const kiosk = await kioskContext.newPage();
  const tv = await tvContext.newPage();

  await login(admin, "admin");
  await admin.goto("/admin/devices");
  await admin.getByRole("radiogroup", { name: "Jenis perangkat" }).getByRole("radio", { name: "Kiosk tiket" }).click();
  await admin.getByLabel("Nama perangkat").fill(name);
  await admin.getByRole("button", { name: "Buat tautan pemasangan" }).click();

  const dialog = admin.getByRole("dialog", { name: `Tautan pemasangan ${name}` });
  await expect(dialog).toBeVisible();
  const link = (await dialog.getByTestId("device-link").textContent())?.trim() ?? "";
  expect(link).toMatch(/\/kiosk\?token=.+/);
  const token = new URL(link).searchParams.get("token");
  expect(token).toBeTruthy();
  await dialog.getByRole("button", { name: "Selesai" }).click();
  await expect(dialog).toBeHidden();

  // The link installs the kiosk: the token becomes a cookie and the address bar is clean again.
  await kiosk.goto(link);
  await expect(kiosk.getByRole("heading", { name: "Silakan pilih layanan" })).toBeVisible();
  expect(kiosk.url()).not.toContain("token=");

  // A kiosk token never opens the TV.
  await tv.goto(`/display?token=${encodeURIComponent(token!)}`);
  await expect(tv.getByRole("heading", { name: "Perangkat belum diizinkan" })).toBeVisible();

  await admin.reload();
  await admin.getByRole("button", { name: `Cabut ${name}`, exact: true }).click();
  const confirm = admin.getByRole("dialog", { name: `Cabut ${name}?` });
  await confirm.getByRole("button", { name: "Cabut izin" }).click();
  await expect(confirm).toBeHidden();
  await expect(admin.getByText(`${name} dicabut.`)).toBeVisible();

  await kiosk.goto("/kiosk");
  await expect(kiosk.getByRole("heading", { name: "Perangkat belum diizinkan" })).toBeVisible();

  await adminContext.close();
  await kioskContext.close();
  await tvContext.close();
});

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  await page.getByLabel("Kata sandi").fill("change-me");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
