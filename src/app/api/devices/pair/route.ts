import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { redeemPairCode } from "@/lib/auth/devices";
import { clientAddress, longestWait, pairRateLimit, waitText } from "@/lib/auth/rate-limit";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OVERALL = "all";

/**
 * Dipanggil aplikasi Windows kiosk atau TV saat pemasangan pertama: tukar kode pendek dari Admin → Perangkat
 * dengan token perangkat. Tidak memerlukan login; kode sekali pakai, berlaku 30 menit, dan percobaan
 * yang salah dibatasi.
 */
export async function POST(request: Request): Promise<Response> {
  const client = clientAddress(request.headers);
  const wait = longestWait([
    [pairRateLimit.perAddress, client],
    [pairRateLimit.overall, OVERALL],
  ]);
  if (wait > 0) {
    return adminErrorResponse(
      new AdminError("RATE_LIMITED", `Terlalu banyak kode yang salah. Coba lagi dalam ${waitText(wait)}.`),
    ) as Response;
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  try {
    const paired = await redeemPairCode(getPrisma(), body?.code);
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
