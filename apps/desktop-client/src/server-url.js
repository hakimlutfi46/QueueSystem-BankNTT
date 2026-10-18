'use strict';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Accepts "192.168.1.53:3000", "http://192.168.1.53:3000/", "https://antrian.local"
 * and returns the bare origin ("http://192.168.1.53:3000"), or null if invalid.
 */
function normaliseServer(input) {
  let value = String(input ?? '').trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.origin;
}

/** "4k7-q2m" -> "4K7Q2M" (uppercase, strip everything that is not A-Z/0-9). */
function normaliseCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function isValidCode(code) {
  return (
    typeof code === 'string' &&
    code.length === CODE_LENGTH &&
    [...code].every((ch) => CODE_ALPHABET.includes(ch))
  );
}

/** Also true for blob:/filesystem: URLs created by that origin (new URL('blob:http://x/…').origin). */
function sameOrigin(url, origin) {
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function hostOf(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

module.exports = {
  CODE_ALPHABET,
  CODE_LENGTH,
  normaliseServer,
  normaliseCode,
  isValidCode,
  sameOrigin,
  hostOf,
};
