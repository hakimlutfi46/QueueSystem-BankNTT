#!/usr/bin/env node
// Builds BANK NTT TV for Android TV / Google TV (Xiaomi TV and similar) without Gradle:
// aapt2 (resources + manifest) -> javac -> d8 -> zipalign -> apksigner.
//
//   npm run tv:build:android      -> downloads/android/BANK-NTT-TV.apk
//
// Needs a JDK and the Android SDK (build-tools + one platform). The SDK is taken from ANDROID_HOME,
// ANDROID_SDK_ROOT, Homebrew's android-commandlinetools or ~/Library/Android/sdk.
//
// Signing key: apps/android-tv/.signing/bankntt-tv.jks, created on the first build and git-ignored.
// Keep a backup: an update must be signed with the same key, otherwise the TV has to uninstall the
// old app first (and the TV is registered again).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const out = path.join(here, "build");
const signingDir = path.join(here, ".signing");
const keystore = path.join(signingDir, "bankntt-tv.jks");
const keyPass = "bankntt-tv";
const target = path.join(repoRoot, "downloads", "android", "BANK-NTT-TV.apk");
const MIN_SDK = 21;
const TARGET_SDK = 34;

function fail(message) {
  console.error(`\nGagal: ${message}`);
  process.exit(1);
}

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: ["ignore", "inherit", "inherit"] });
  } catch {
    fail(`${path.basename(command)} ${args.slice(0, 2).join(" ")} …`);
  }
}

function findSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    "/opt/homebrew/share/android-commandlinetools",
    path.join(os.homedir(), "Library/Android/sdk"),
    path.join(os.homedir(), "Android/Sdk"),
  ].filter(Boolean);
  const sdk = candidates.find((dir) => fs.existsSync(path.join(dir, "build-tools")) && fs.existsSync(path.join(dir, "platforms")));
  if (!sdk) fail("Android SDK tidak ditemukan. Atur ANDROID_HOME ke folder SDK.");
  return sdk;
}

const byVersion = (a, b) => b.localeCompare(a, undefined, { numeric: true });

const sdk = findSdk();
const buildTools = path.join(sdk, "build-tools", fs.readdirSync(path.join(sdk, "build-tools")).sort(byVersion)[0]);
const platforms = fs.readdirSync(path.join(sdk, "platforms")).filter((p) => fs.existsSync(path.join(sdk, "platforms", p, "android.jar")));
const platform = platforms.includes(`android-${TARGET_SDK}`) ? `android-${TARGET_SDK}` : platforms.sort(byVersion)[0];
if (!platform) fail("Tidak ada platform Android (android.jar) di SDK.");
const androidJar = path.join(sdk, "platforms", platform, "android.jar");
const tool = (name) => path.join(buildTools, name);

const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
// Minutes since 2025: every build installs over the previous one.
const versionCode = String(Math.floor((Date.now() - Date.UTC(2025, 0, 1)) / 60_000));

console.log(`> SDK ${sdk}\n  build-tools ${path.basename(buildTools)}, ${platform}, versi ${version} (${versionCode})`);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "classes"), { recursive: true });
fs.mkdirSync(path.join(out, "dex"), { recursive: true });

console.log("> resource dan manifest");
run(tool("aapt2"), ["compile", "--dir", path.join(here, "res"), "-o", path.join(out, "res.zip")]);
run(tool("aapt2"), [
  "link",
  "-o", path.join(out, "unsigned.apk"),
  "-I", androidJar,
  "--manifest", path.join(here, "AndroidManifest.xml"),
  "--min-sdk-version", String(MIN_SDK),
  "--target-sdk-version", String(TARGET_SDK),
  "--version-code", versionCode,
  "--version-name", version,
  path.join(out, "res.zip"),
]);

console.log("> kompilasi Java");
const sources = fs
  .readdirSync(path.join(here, "src/id/bankntt/tv"))
  .filter((f) => f.endsWith(".java"))
  .map((f) => path.join(here, "src/id/bankntt/tv", f));
run("javac", ["-source", "8", "-target", "8", "-Xlint:-options", "-encoding", "UTF-8", "-bootclasspath", `${androidJar}${path.delimiter}${tool("core-lambda-stubs.jar")}`, "-d", path.join(out, "classes"), ...sources]);
const classes = [];
(function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith(".class")) classes.push(full);
  }
})(path.join(out, "classes"));
run(tool("d8"), ["--release", "--min-api", String(MIN_SDK), "--lib", androidJar, "--output", path.join(out, "dex"), ...classes]);
execFileSync("zip", ["-q", "-j", path.join(out, "unsigned.apk"), path.join(out, "dex", "classes.dex")]);

console.log("> tanda tangan");
if (!fs.existsSync(keystore)) {
  fs.mkdirSync(signingDir, { recursive: true });
  console.log(`  membuat kunci baru ${path.relative(repoRoot, keystore)} (simpan cadangannya)`);
  run("keytool", [
    "-genkeypair", "-keystore", keystore, "-storepass", keyPass, "-keypass", keyPass,
    "-alias", "bankntt-tv", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
    "-dname", "CN=BANK NTT TV, O=Bank NTT, C=ID",
  ]);
}
run(tool("zipalign"), ["-p", "-f", "4", path.join(out, "unsigned.apk"), path.join(out, "aligned.apk")]);
fs.mkdirSync(path.dirname(target), { recursive: true });
run(tool("apksigner"), ["sign", "--ks", keystore, "--ks-pass", `pass:${keyPass}`, "--ks-key-alias", "bankntt-tv", "--out", target, path.join(out, "aligned.apk")]);
fs.rmSync(`${target}.idsig`, { force: true });

const size = (fs.statSync(target).size / 1024).toFixed(0);
console.log(`\nSelesai: ${path.relative(repoRoot, target)} (${size} KB)`);
