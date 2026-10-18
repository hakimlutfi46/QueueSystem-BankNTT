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

  // Perangkat yang sudah dicabut bisa dihapus dari daftar.
  await admin.getByRole("button", { name: `Hapus ${name}`, exact: true }).click();
  await admin.getByRole("dialog", { name: `Hapus ${name}?` }).getByRole("button", { name: "Hapus perangkat" }).click();
  await expect(admin.getByText(`${name} dihapus.`)).toBeVisible();
  await expect(admin.getByTestId(/^device-/).filter({ hasText: name })).toHaveCount(0);

  await adminContext.close();
  await kioskContext.close();
  await tvContext.close();
});

test("the Windows kiosk app pairs with a short code from the admin page", async ({ browser, request }) => {
  const name = `Kiosk Windows E2E ${Date.now()}`;
  const adminContext = await browser.newContext();
  const kioskContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const kiosk = await kioskContext.newPage();

  await login(admin, "admin");
  await admin.goto("/admin/devices");
  await expect(admin.getByRole("heading", { name: "Aplikasi kiosk Windows" })).toBeVisible();
  await admin.getByRole("radiogroup", { name: "Jenis perangkat" }).getByRole("radio", { name: "Kiosk tiket" }).click();
  await admin.getByLabel("Nama perangkat").fill(name);
  await admin.getByRole("button", { name: "Buat tautan pemasangan" }).click();
  await admin.getByRole("dialog", { name: `Tautan pemasangan ${name}` }).getByRole("button", { name: "Buat kode aplikasi" }).click();

  const dialog = admin.getByRole("dialog", { name: `Kode aplikasi ${name}` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Berlaku \d+:\d{2} lagi/)).toBeVisible();
  const code = (await dialog.getByTestId("pair-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

  // Yang dilakukan aplikasi Windows: tukar kode dengan token, lalu buka kiosk dengan token itu.
  const wrong = await request.post("/api/devices/pair", { data: { code: "ZZZ-ZZZ" } });
  expect(wrong.status()).toBe(404);
  expect((await wrong.json()).error.message).toContain("tidak dikenal");

  const paired = await request.post("/api/devices/pair", { data: { code: code.toLowerCase() } });
  expect(paired.status()).toBe(200);
  const body = (await paired.json()) as { token: string; kind: string; name: string };
  expect(body).toMatchObject({ kind: "kiosk", name });

  const again = await request.post("/api/devices/pair", { data: { code } });
  expect(again.status()).toBe(404);

  await kiosk.goto(`/kiosk?token=${encodeURIComponent(body.token)}`);
  await expect(kiosk.getByRole("heading", { name: "Silakan pilih layanan" })).toBeVisible();

  await dialog.getByRole("button", { name: "Selesai" }).click();
  await admin.reload();
  await expect(admin.getByTestId(/^device-/).filter({ hasText: name }).getByText("Tersambung").first()).toBeVisible();

  // Bersihkan: perangkat uji dicabut supaya tidak dipakai uji lain.
  await admin.getByRole("button", { name: `Cabut ${name}`, exact: true }).click();
  await admin.getByRole("dialog", { name: `Cabut ${name}?` }).getByRole("button", { name: "Cabut izin" }).click();
  await expect(admin.getByText(`${name} dicabut.`)).toBeVisible();

  await adminContext.close();
  await kioskContext.close();
});

test("the Windows TV app pairs with a short code from the admin page", async ({ browser, request }) => {
  const name = `TV Windows E2E ${Date.now()}`;
  const adminContext = await browser.newContext();
  const tvContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const tv = await tvContext.newPage();

  await login(admin, "admin");
  await admin.goto("/admin/devices");
  await admin.getByRole("radiogroup", { name: "Jenis perangkat" }).getByRole("radio", { name: "Layar TV" }).click();
  await admin.getByLabel("Nama perangkat").fill(name);
  await admin.getByRole("button", { name: "Buat tautan pemasangan" }).click();
  await admin.getByRole("dialog", { name: `Tautan pemasangan ${name}` }).getByRole("button", { name: "Buat kode aplikasi" }).click();

  const dialog = admin.getByRole("dialog", { name: `Kode aplikasi ${name}` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("BANK NTT TV")).toBeVisible();
  await expect(dialog.getByText(/printer thermal/)).toHaveCount(0);
  const code = (await dialog.getByTestId("pair-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

  const paired = await request.post("/api/devices/pair", { data: { code } });
  expect(paired.status()).toBe(200);
  const body = (await paired.json()) as { token: string; kind: string; name: string };
  expect(body).toMatchObject({ kind: "display", name });

  await tv.goto(`/display?token=${encodeURIComponent(body.token)}`);
  await expect(tv.getByRole("button", { name: "Aktifkan suara" })).toBeVisible();
  expect(tv.url()).not.toContain("token=");

  await dialog.getByRole("button", { name: "Selesai" }).click();
  await admin.reload();
  await admin.getByRole("button", { name: `Cabut ${name}`, exact: true }).click();
  await admin.getByRole("dialog", { name: `Cabut ${name}?` }).getByRole("button", { name: "Cabut izin" }).click();
  await expect(admin.getByText(`${name} dicabut.`)).toBeVisible();

  await adminContext.close();
  await tvContext.close();
});

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  await page.getByLabel("Kata sandi").fill("change-me");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
