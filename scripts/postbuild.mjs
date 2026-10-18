#!/usr/bin/env node
// Copies static assets and public directory to .next/standalone for production standalone server
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

if (existsSync(standaloneDir)) {
  const staticSrc = path.join(root, ".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  const publicSrc = path.join(root, "public");
  const publicDest = path.join(standaloneDir, "public");

  if (existsSync(staticSrc)) {
    mkdirSync(path.dirname(staticDest), { recursive: true });
    cpSync(staticSrc, staticDest, { recursive: true, force: true });
    console.log("✓ Berhasil menyalin .next/static ke standalone server.");
  }

  if (existsSync(publicSrc)) {
    mkdirSync(publicDest, { recursive: true });
    cpSync(publicSrc, publicDest, { recursive: true, force: true });
    console.log("✓ Berhasil menyalin public/ ke standalone server.");
  }
}
