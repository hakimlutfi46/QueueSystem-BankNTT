import { timingSafeEqual } from "node:crypto";
import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { autoRegisterDevice, redeemPairCode } from "@/lib/auth/devices";
import { autoRegisterRateLimit, clientAddress, longestWait, pairRateLimit, waitText } from "@/lib/auth/rate-limit";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OVERALL = "all";

/**
 * Kunci acak yang dibuat installer server Windows (LOCAL_DEVICE_KEY di server.env, salinannya di
 * C:\ProgramData\BankNTT\local-device.key). Hanya aplikasi kiosk di PC server itu sendiri yang bisa
 * membacanya, jadi kiosk tersebut langsung disetujui tanpa menunggu admin.
 */
function isLocalDeviceKey(input: unknown): boolean {
  const expected = process.env.LOCAL_DEVICE_KEY?.trim();
  if (!expected || expected.length < 32 || typeof input !== "string") return false;
  const left = Buffer.from(input.trim());
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Dipanggil aplikasi kiosk atau TV saat pemasangan. Tidak memerlukan login.
 * - Dengan `code`: tukar kode pendek dari Admin → Perangkat dengan token perangkat (langsung disetujui).
 *   Kode sekali pakai, berlaku 30 menit, dan percobaan yang salah dibatasi.
 * - Tanpa kode: perangkat mendaftar sendiri dan menunggu persetujuan admin, kecuali "Terima perangkat
 *   baru otomatis" menyala. `installId` membuat pemasangan ulang di PC yang sama memakai perangkat yang sama.
 */
export async function POST(request: Request): Promise<Response> {
  const client = clientAddress(request.headers);
  const body = (await request.json().catch(() => null)) as
    | { code?: unknown; kind?: unknown; name?: unknown; installId?: unknown; localKey?: unknown }
    | null;

  if (typeof body?.code === "string" && body.code.trim()) {
    const wait = longestWait([
      [pairRateLimit.perAddress, client],
      [pairRateLimit.overall, OVERALL],
    ]);
    if (wait > 0) {
      return adminErrorResponse(
        new AdminError("RATE_LIMITED", `Terlalu banyak kode yang salah. Coba lagi dalam ${waitText(wait)}.`),
      ) as Response;
    }
    try {
      const paired = await redeemPairCode(getPrisma(), body.code, body.installId);
      pairRateLimit.perAddress.reset(client);
      return Response.json(paired, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const known = adminErrorResponse(error);
      if (known) {
        if (error instanceof AdminError && error.code !== "VALIDATION") {
          pairRateLimit.perAddress.fail(client);
          pairRateLimit.overall.fail(OVERALL);
        }
        return known;
      }
      console.error(error);
      return Response.json({ error: { code: "PAIR_FAILED", message: "Pemasangan gagal. Coba lagi." } }, { status: 500 });
    }
  }

  const wait = longestWait([
    [autoRegisterRateLimit.perAddress, client],
    [autoRegisterRateLimit.overall, OVERALL],
  ]);
  if (wait > 0) {
    return adminErrorResponse(
      new AdminError("RATE_LIMITED", `Terlalu banyak pendaftaran perangkat. Coba lagi dalam ${waitText(wait)}.`),
    ) as Response;
  }
  autoRegisterRateLimit.perAddress.fail(client);
  autoRegisterRateLimit.overall.fail(OVERALL);
  try {
    const paired = await autoRegisterDevice(getPrisma(), body?.kind, body?.name, body?.installId, {
      approve: isLocalDeviceKey(body?.localKey),
    });
    return Response.json(paired, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = adminErrorResponse(error);
    if (known) return known;
    console.error(error);
    return Response.json({ error: { code: "PAIR_FAILED", message: "Penyambungan otomatis gagal." } }, { status: 500 });
  }
}
