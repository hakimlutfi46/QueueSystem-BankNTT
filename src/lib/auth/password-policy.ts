/**
 * Aturan kata sandi yang dipilih sendiri oleh pemilik akun. Kata sandi bawaan seeder ("Password123",
 * "change-me"), sandi umum, sandi sama dengan nama pengguna, dan sandi pendek dianggap lemah: akun yang
 * masuk dengan sandi seperti itu wajib menggantinya dulu.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 80;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "change-me",
  "changeme",
  "admin",
  "admin123",
  "administrator",
  "petugas",
  "petugas123",
  "bankntt",
  "bankntt123",
  "qwerty",
  "qwerty123",
  "letmein",
  "welcome",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "11111111",
  "00000000",
  "87654321",
]);

export function isWeakPassword(password: string, username: string): boolean {
  const lower = password.toLowerCase();
  const name = username.trim().toLowerCase();
  if (password.length < MIN_PASSWORD_LENGTH) return true;
  if (COMMON_PASSWORDS.has(lower)) return true;
  if (name && (lower === name || lower.includes(name))) return true;
  // Satu karakter yang diulang, misalnya "aaaaaaaa".
  return new Set(lower).size <= 2;
}

/**
 * Hanya untuk uji end-to-end, yang masuk dengan sandi seeder "change-me". Jangan diisi di server cabang.
 */
export function weakPasswordsAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTH_ALLOW_WEAK_PASSWORDS?.trim().toLowerCase() === "true";
}

/** Pesan galat untuk sandi baru, atau null bila boleh dipakai. */
export function newPasswordProblem(input: {
  password: string;
  confirm: string;
  username: string;
  current: string;
}): string | null {
  if (input.password.length < MIN_PASSWORD_LENGTH) return `Kata sandi baru minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  if (input.password.length > MAX_PASSWORD_LENGTH) return `Kata sandi baru paling panjang ${MAX_PASSWORD_LENGTH} karakter.`;
  if (input.password !== input.confirm) return "Ulangi kata sandi baru dengan sama persis.";
  if (input.password === input.current) return "Kata sandi baru harus berbeda dari yang sekarang.";
  if (isWeakPassword(input.password, input.username)) {
    return "Kata sandi terlalu mudah ditebak. Hindari nama pengguna, sandi bawaan, dan angka berurutan.";
  }
  return null;
}
