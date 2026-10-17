import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { kioskEntry } from "./device";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      const root = window.top ?? window;
      const counter = root as Window & { __printCount?: number };
      counter.__printCount = (counter.__printCount ?? 0) + 1;
      window.dispatchEvent(new Event("afterprint"));
    };
  });
});

test("one touch issues one ticket and prints it once", async ({ page }) => {
  const before = await ticketCount();
  await page.goto(kioskEntry());
  const button = page.getByRole("button", { name: /Customer Service/ });
  await expect(button).toBeVisible();

  await button.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.click();
    element.click();
  });

  await expect(page.getByText("antrian di depan Anda")).toBeVisible();
  const ticketId = await page.locator("[data-ticket-id]").getAttribute("data-ticket-id");
  expect(ticketId).toBeTruthy();
  await expect.poll(() => ticketCount()).toBe(before + 1);
  await expect.poll(() => printCount(page)).toBe(1);

  await page.goto(`/kiosk/print/${ticketId}`);
  await expect(page.getByText("NOMOR ANTRIAN")).toBeVisible();
  await expect(page.getByText("Customer Service")).toBeVisible();
  // Tiket hanya memuat logo di atas nomor; nama lembaga dan slogan tidak dicetak.
  await expect(page.getByRole("img", { name: "Bank NTT" })).toBeVisible();
  await expect(page.getByText("melayani lebih sungguh")).toHaveCount(0);
  await expect(page.getByText("Bank NTT", { exact: true })).toHaveCount(0);
});

test("a failed request does not print a ticket", async ({ page }) => {
  const before = await ticketCount();
  await page.route("**/api/tickets", (route) => route.abort());
  await page.goto(kioskEntry());
  const button = page.getByRole("button", { name: /Teller/ });
  await expect(button).toBeVisible();
  await button.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.click();
  });
  await expect(page.getByText("Mohon hubungi petugas")).toBeVisible();
  expect(await ticketCount()).toBe(before);
  expect(await printCount(page)).toBe(0);
});

test("inside the Windows app the ticket goes to the app's printer, not the browser dialog", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as Window & { __appPrints?: string[] }).__appPrints = calls;
    (window as Window & { kioskApp?: unknown }).kioskApp = {
      version: "test",
      printerStatus: async () => ({ ready: true, printer: "POS-80", message: null }),
      printTicket: async (id: string) => {
        calls.push(id);
        return { ok: true, message: null };
      },
    };
  });
  const before = await ticketCount();
  await page.goto(kioskEntry());
  await page.getByRole("button", { name: /Customer Service/ }).click();
  await expect(page.getByText("Silakan ambil tiket yang tercetak")).toBeVisible();
  const ticketId = await page.locator("[data-ticket-id]").getAttribute("data-ticket-id");
  await expect.poll(() => page.evaluate(() => (window as Window & { __appPrints?: string[] }).__appPrints)).toEqual([ticketId]);
  expect(await printCount(page)).toBe(0);
  expect(await ticketCount()).toBe(before + 1);
});

test("inside the Windows app no number is issued while the printer is not ready", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { kioskApp?: unknown }).kioskApp = {
      version: "test",
      printerStatus: async () => ({ ready: false, printer: "POS-80", message: "Kertas habis." }),
      printTicket: async () => ({ ok: true, message: null }),
    };
  });
  const before = await ticketCount();
  await page.goto(kioskEntry());
  const problem = page.getByTestId("kiosk-printer-problem");
  await expect(problem.getByText("Mohon hubungi petugas")).toBeVisible();
  await expect(problem.getByText("Kertas habis.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Customer Service/ })).toHaveCount(0);
  expect(await ticketCount()).toBe(before);
});

async function ticketCount(): Promise<number> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM tickets");
    return result.rows[0]?.count ?? 0;
  } finally {
    await client.end();
  }
}

async function printCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as Window & { __printCount?: number }).__printCount ?? 0);
}
