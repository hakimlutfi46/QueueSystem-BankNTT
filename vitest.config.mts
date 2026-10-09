import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Queue tests share one Postgres database, so files and cases stay serial.
    fileParallelism: false,
    sequence: { concurrent: false },
    // next-auth imports "next/server" without an extension, which Node's ESM resolver rejects.
    server: { deps: { inline: ["next-auth"] } },
    // Uji menghitung tanggal dan jam dengan WITA, apa pun isi .env di mesin pengembang.
    env: { APP_TIMEZONE: "Asia/Makassar" },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
