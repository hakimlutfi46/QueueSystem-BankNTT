import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

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
  await page.goto("/kiosk");
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
  await expect(page.getByText("melayani lebih sungguh")).toBeVisible();
});

test("a failed request does not print a ticket", async ({ page }) => {
  const before = await ticketCount();
  await page.route("**/api/tickets", (route) => route.abort());
  await page.goto("/kiosk");
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
