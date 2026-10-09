import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

dotenv.config();

// Next.js allows one `next dev` per project. With E2E_PORT set, the tests start the production build
// (`npm run build` first) on that port instead, so they can run beside a `npm run dev` on port 3000.
const separatePort = process.env.E2E_PORT;
const port = Number(separatePort ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;
process.env.E2E_BASE_URL = baseURL;

const serverEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: separatePort ? `npx next start --port ${port}` : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: serverEnv,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
