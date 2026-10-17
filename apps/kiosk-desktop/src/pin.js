'use strict';

const crypto = require('node:crypto');

// scrypt parameters: N=2^15 is ~50 ms on a modest kiosk PC, good enough for a
// short numeric PIN that is additionally rate-limited in the admin prompt.
const N = 32768;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const MAXMEM = 64 * 1024 * 1024;

function scrypt(pin, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(pin), salt, KEY_LEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Returns "scrypt$N$r$p$saltB64$hashB64". */
async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pin, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPin(pin, stored) {
  if (typeof stored !== 'string' || typeof pin !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(pin, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4,12}$/.test(pin);
}

module.exports = { hashPin, verifyPin, isValidPin };
