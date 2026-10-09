import type { z } from "zod";

export class AdminError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AdminError";
    this.code = code;
  }
}

const clientErrors: Record<string, { status: number; message: string | null }> = {
  VALIDATION: { status: 400, message: null },
  NOT_FOUND: { status: 404, message: "Data tidak ditemukan." },
  PREFIX_TAKEN: { status: 409, message: "Huruf awalan sudah dipakai." },
  USERNAME_TAKEN: { status: 409, message: "Nama pengguna sudah dipakai." },
  SERVICE_NOT_FOUND: { status: 400, message: "Layanan tidak ditemukan." },
  NAME_TAKEN: { status: 409, message: null },
  COUNTER_BUSY: { status: 409, message: "Tutup loket terlebih dahulu." },
  CANNOT_CHANGE_SELF: { status: 409, message: "Anda tidak dapat menonaktifkan akun sendiri." },
  USER_ON_DUTY: { status: 409, message: null },
  COUNTER_LAST_SERVICE: { status: 409, message: null },
};

export function adminErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AdminError)) return null;
  const known = clientErrors[error.code] ?? { status: 400, message: error.message };
  return Response.json(
    { error: { code: error.code, message: known.message ?? error.message } },
    { status: known.status },
  );
}

/** Galat validasi dengan pesan dari aturan pertama yang dilanggar, supaya admin tahu kolom mana yang salah. */
export function validationError(error: z.ZodError | undefined): AdminError {
  const message = error?.issues[0]?.message;
  return new AdminError("VALIDATION", message && !message.startsWith("Invalid") ? message : "Data tidak valid.");
}
