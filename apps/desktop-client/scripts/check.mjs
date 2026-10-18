#!/usr/bin/env node
// Syntax-checks every JS file of the app with `node --check`.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(c|m)?js$/.test(name)) files.push(full);
  }
})(appDir);

let failed = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    failed += 1;
    console.error(`FAIL ${path.relative(appDir, file)}\n${res.stderr}`);
  } else {
    console.log(`ok   ${path.relative(appDir, file)}`);
  }
}
process.exit(failed ? 1 : 0);
