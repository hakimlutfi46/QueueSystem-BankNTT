import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { autoRegisterDevice, redeemPairCode, type PairedDevice } from "@/lib/auth/devices";
import { clientAddress, longestWait, pairRateLimit, waitText } from "@/lib/auth/rate-limit";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OVERALL = "all";

/**
 * Dipanggil aplikasi kiosk atau TV saat pemasangan:
 * - Bila menyertakan kode: tukar kode pendek dari Admin → Perangkat dengan token perangkat.
 * - Bila tanpa kode: langsung mendaftarkan dan menghubungkan perangkat secara otomatis di jaringan lokal.
 */
export async function POST(request: Request): Promise<Response> {
  const client = clientAddress(request.headers);
  const body = (await request.json().catch(() => null)) as { code?: unknown; kind?: unknown; name?: unknown } | null;

  // Bila kode diberikan, gunakan validasi kode dengan rate limit
  if (body?.code && String(body.code).trim()) {
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
      const paired = await redeemPairCode(getPrisma(), body.code);
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
      return Response.json(
        { error: { code: "PAIR_FAILED", message: "Pemasangan gagal. Coba lagi." } },
        { status: 500 },
      );
    }
  }

  // Pemasangan otomatis tanpa kode untuk jaringan lokal cabang (kiosk & TV langsung terhubung)
  try {
    const paired: PairedDevice = await autoRegisterDevice(getPrisma(), body?.kind, body?.name);
    return Response.json(paired, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: { code: "PAIR_FAILED", message: "Penyambungan otomatis gagal." } },
      { status: 500 },
    );
  }
}
