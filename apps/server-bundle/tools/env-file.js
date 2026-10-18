"use strict";
// Minimal KEY=VALUE parser for C:\ProgramData\BankNTT\server.env (no dotenv dependency).
// Supports blank lines, `#` comments, optional `export ` prefix and single/double quoted values.

const fs = require("node:fs");

function parseEnv(text) {
  const result = {};
  for (const rawLine of String(text).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2];
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else {
      // Unquoted values may carry a trailing comment: KEY=value # comment
      const hash = value.search(/\s#/);
      if (hash !== -1) value = value.slice(0, hash);
      value = value.trim();
    }
    result[match[1]] = value;
  }
  return result;
}

/**
 * Loads an env file into `target` (process.env by default). Variables that are already set win,
 * like dotenv, so a value can be overridden for a single run from the shell.
 * Returns the parsed values, or null when the file does not exist.
 */
function loadEnvFile(file, target = process.env) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
  const values = parseEnv(text);
  for (const [key, value] of Object.entries(values)) {
    if (target[key] === undefined) target[key] = value;
  }
  return values;
}

module.exports = { parseEnv, loadEnvFile };
