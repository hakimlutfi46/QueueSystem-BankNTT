import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { displayEntry, ticketEndpoint } from "./device";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await query(`
    UPDATE tickets
    SET status = 'DONE', finished_at = now(), auto_closed = true
    WHERE status = 'SERVING'
  `);
  await query(`UPDATE counters SET status = 'CLOSED', current_user_id = NULL`);
});

test("a counter call shows on the TV and two close calls are spoken in order", async ({ browser }) => {
  const serviceId = await serviceA();
  for (let index = 0; index < 2; index += 1) {
    const response = await fetch(ticketEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serviceId, requestId: randomUUID() }),
    });
    expect(response.ok).toBe(true);
  }

  const displayContext = await browser.newContext();
  const officerContext = await browser.newContext();
  const display = await displayContext.newPage();
  const officer = await officerContext.newPage();
  await display.addInitScript(() => {
    const spoken: string[] = [];
    (window as Window & { __spoken?: string[] }).__spoken = spoken;
    const synth = window.speechSynthesis;
    synth.getVoices = () => [{ lang: "id-ID", name: "Indonesia" } as SpeechSynthesisVoice];
    synth.speak = (utterance: SpeechSynthesisUtterance) => {
      window.setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 0);
    };
  });

  await display.goto(displayEntry());
  await display.getByRole("button", { name: "Aktifkan suara" }).click();
  await login(officer, "petugas.cs");
  await officer.getByRole("button", { name: "Buka CS 1" }).click();

  const first = await callNext(officer);
  await expect(display.getByTestId("last-call")).toContainText(first, { timeout: 2_000 });
  const second = await callNext(officer);
  await expect(display.getByTestId("last-call")).toContainText(second, { timeout: 2_000 });
  await expect(display.locator("article", { hasText: "CS 1" })).toContainText(second);

  await expect.poll(() => spoken(display), { timeout: 10_000 }).toEqual([
    expect.stringContaining(`Nomor antrian A, ${words(first)}`),
    expect.stringContaining(`Nomor antrian A, ${words(second)}`),
  ]);

  await displayContext.close();
  await officerContext.close();
});

function words(ticketNumber: string): string {
  const sequence = Number(ticketNumber.replace(/\D/g, ""));
  return spell(sequence);
}

function spell(value: number): string {
  const ones = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
  const below100 = (current: number): string => {
    if (current < 10) return ones[current] ?? "";
    if (current === 10) return "sepuluh";
    if (current === 11) return "sebelas";
    if (current < 20) return `${ones[current - 10]} belas`;
    const tens = Math.floor(current / 10);
    const rest = current % 10;
    return rest === 0 ? `${ones[tens]} puluh` : `${ones[tens]} puluh ${ones[rest]}`;
  };
  if (value < 100) return below100(value);
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const head = hundreds === 1 ? "seratus" : `${ones[hundreds]} ratus`;
  return rest === 0 ? head : `${head} ${below100(rest)}`;
}

async function spoken(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as Window & { __spoken?: string[] }).__spoken ?? []);
}

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
  return (await number.innerText()).trim();
}

async function serviceA(): Promise<number> {
  const rows = await query<{ id: number }>("SELECT id FROM services WHERE prefix = 'A' LIMIT 1");
  const id = rows[0]?.id;
  if (!id) throw new Error("Service A is missing");
  return id;
}

async function query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string): Promise<T[]> {
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
