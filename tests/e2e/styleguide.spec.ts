import { expect, test } from "@playwright/test";

test("styleguide shows tokens and brand components", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { name: "Panduan tampilan" })).toBeVisible();
  await expect(page.getByText("brand-navy", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Utama" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Customer Service" })).toBeVisible();
  await expect(page.getByText("A012").first()).toBeVisible();
  await expect(page.getByText("melayani lebih sungguh").first()).toBeVisible();
});
