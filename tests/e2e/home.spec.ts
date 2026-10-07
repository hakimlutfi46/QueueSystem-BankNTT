import { expect, test } from "@playwright/test";

test("home page shows the queue system", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sistem Antrian" })).toBeVisible();
  await expect(page.getByText("Aplikasi cabang siap dijalankan.")).toBeVisible();
});
