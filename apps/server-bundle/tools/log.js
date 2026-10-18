"use strict";
// File logger with simple size rotation: server.log -> server.1.log -> ... -> server.<keep>.log.
// Also captures everything written to stdout/stderr (Next.js logs) into the same file.

const fs = require("node:fs");
const path = require("node:path");

function createFileLog(options) {
  const file = options.file;
  const maxBytes = options.maxBytes || 5 * 1024 * 1024;
  const keep = options.keep || 5;
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    size = 0;
  }

  function rotate() {
    const base = file.replace(/\.log$/, "");
    try {
      fs.rmSync(`${base}.${keep}.log`, { force: true });
      for (let index = keep - 1; index >= 1; index -= 1) {
        const from = `${base}.${index}.log`;
        if (fs.existsSync(from)) fs.renameSync(from, `${base}.${index + 1}.log`);
      }
      if (fs.existsSync(file)) fs.renameSync(file, `${base}.1.log`);
    } catch {
      // A locked file (e.g. opened in Notepad) must never stop the server; keep appending instead.
    }
    size = 0;
  }

  function writeRaw(text) {
    if (!text) return;
    try {
      if (size + Buffer.byteLength(text) > maxBytes) rotate();
      fs.appendFileSync(file, text);
      size += Buffer.byteLength(text);
    } catch {
      // Disk full or permission problem: logging is best effort.
    }
  }

  let pending = { out: "", err: "" };
  function stamp(stream, chunk) {
    // Prefix complete lines with a timestamp; keep partial lines until their newline arrives.
    const text = pending[stream] + chunk;
    const lines = text.split(/\r?\n/);
    pending[stream] = lines.pop();
    if (lines.length === 0) return;
    const now = new Date().toISOString();
    const tag = stream === "err" ? " ERR " : " ";
    writeRaw(lines.map((line) => `${now}${tag}${line}\n`).join(""));
  }

  /** Mirrors process.stdout/stderr into the log file. Console output is kept only for terminals. */
  function captureConsole() {
    const toTerminal = Boolean(process.stdout.isTTY) || process.env.BANKNTT_LOG_STDOUT === "1";
    for (const [name, stream] of [
      ["out", process.stdout],
      ["err", process.stderr],
    ]) {
      const original = stream.write.bind(stream);
      stream.write = (chunk, encoding, callback) => {
        try {
          stamp(name, typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        } catch {
          // ignore
        }
        if (toTerminal) return original(chunk, encoding, callback);
        if (typeof encoding === "function") encoding();
        else if (typeof callback === "function") callback();
        return true;
      };
    }
  }

  function flush() {
    for (const stream of ["out", "err"]) {
      if (pending[stream]) {
        writeRaw(`${new Date().toISOString()} ${pending[stream]}\n`);
        pending[stream] = "";
      }
    }
  }

  return { captureConsole, flush, file };
}

module.exports = { createFileLog };
