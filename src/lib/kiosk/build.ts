import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AdminError } from "@/lib/admin/errors";

/**
 * Build ulang installer kiosk Windows dari Admin. Menjalankan skrip yang sama dengan `npm run kiosk:build`
 * sebagai proses terpisah, satu build dalam satu waktu. Status disimpan di memori proses server: cukup untuk
 * satu server cabang, dan admin bisa memulai lagi bila server dimulai ulang di tengah build.
 *
 * Hanya bisa dipakai bila server berjalan dari folder proyek lengkap (ada apps/kiosk-desktop), misalnya
 * `npm run start` di server cabang. Image Docker tidak memuat folder itu.
 */
export type KioskBuildStatus = {
  state: "idle" | "running" | "done" | "failed";
  appName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Baris terakhir keluaran build, untuk ditampilkan bila gagal. */
  log: string[];
  error: string | null;
};

const LOG_LINES = 40;
/** Build pertama mengunduh Electron (~100 MB); setelah itu biasanya 1–2 menit. */
const BUILD_TIMEOUT_MS = 15 * 60 * 1000;

const IDLE: KioskBuildStatus = { state: "idle", appName: null, startedAt: null, finishedAt: null, log: [], error: null };

// Disimpan di globalThis supaya status tidak hilang saat modul dimuat ulang oleh `npm run dev`.
const store = globalThis as typeof globalThis & { __kioskBuild?: KioskBuildStatus };

export function kioskBuildStatus(): KioskBuildStatus {
  return store.__kioskBuild ?? IDLE;
}

export function buildScriptPath(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "apps", "kiosk-desktop", "scripts", "build-and-copy.mjs");
}

export function kioskBuildAvailable(): boolean {
  return existsSync(buildScriptPath());
}

export async function startKioskBuild(options: { appName: string; icon: Buffer | null }): Promise<KioskBuildStatus> {
  if (kioskBuildStatus().state === "running") {
    throw new AdminError("BUILD_RUNNING", "Installer sedang dibuat. Tunggu sampai selesai.");
  }
  if (!kioskBuildAvailable()) {
    throw new AdminError(
      "BUILD_UNAVAILABLE",
      "Server ini tidak memuat folder apps/kiosk-desktop, jadi installer tidak bisa dibuat dari sini. Jalankan npm run kiosk:build di komputer yang memuat kode lengkap.",
    );
  }

  const args = [buildScriptPath(), "--name", options.appName];
  if (options.icon) {
    const iconPath = path.join(os.tmpdir(), `kiosk-app-icon-${process.pid}.png`);
    await writeFile(iconPath, options.icon);
    args.push("--icon", iconPath);
  }

  const status: KioskBuildStatus = {
    state: "running",
    appName: options.appName,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    log: [],
    error: null,
  };
  store.__kioskBuild = status;

  // Tanpa shell: nama aplikasi dikirim sebagai argumen biasa.
  const child = spawn(process.execPath, args, {
    cwd: /* turbopackIgnore: true */ process.cwd(),
    env: { ...process.env, FORCE_COLOR: "0", CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const timer = setTimeout(() => {
    status.error = "Build terlalu lama dan dihentikan.";
    child.kill();
  }, BUILD_TIMEOUT_MS);

  let partial = "";
  const collect = (chunk: Buffer) => {
    const lines = (partial + chunk.toString("utf8")).split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      const clean = line.replace(/\u001b\[[0-9;]*m/g, "").trimEnd();
      if (clean) status.log.push(clean);
    }
    if (status.log.length > LOG_LINES) status.log.splice(0, status.log.length - LOG_LINES);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const finish = (ok: boolean, error: string | null) => {
    if (status.state !== "running") return;
    clearTimeout(timer);
    if (partial.trim()) status.log.push(partial.trim());
    status.state = ok ? "done" : "failed";
    status.finishedAt = new Date().toISOString();
    status.error = ok ? null : (status.error ?? error);
  };
  child.on("error", (error) => finish(false, `Build tidak bisa dijalankan: ${error.message}`));
  child.on("close", (code) => {
    const failure = [...status.log].reverse().find((line) => line.startsWith("Gagal:"));
    finish(code === 0, failure ?? `Build berhenti dengan kode ${code}.`);
  });

  return status;
}
