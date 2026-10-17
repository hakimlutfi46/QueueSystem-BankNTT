import { AdminError, adminErrorResponse } from "@/lib/admin/errors";
import { redeemPairCode } from "@/lib/auth/devices";
import { pairRateLimit } from "@/lib/auth/pair-rate-limit";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dipanggil aplikasi kiosk Windows saat pemasangan pertama: tukar kode pendek dari Admin → Perangkat
 * dengan token perangkat. Tidak memerlukan login; kode sekali pakai, berlaku 30 menit, dan percobaan
 * yang salah dibatasi per alamat IP.
 */
export async function POST(request: Request): Promise<Response> {
  const client = clientAddress(request);
  const wait = pairRateLimit.blockedFor(client);
  if (wait > 0) {
    return adminErrorResponse(
      new AdminError("RATE_LIMITED", `Terlalu banyak kode yang salah. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`),
    ) as Response;
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  try {
    const paired = await redeemPairCode(getPrisma(), body?.code);
    pairRateLimit.reset(client);
    return Response.json(paired, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = adminErrorResponse(error);
    if (known) {
      if (error instanceof AdminError && error.code !== "VALIDATION") pairRateLimit.fail(client);
      return known;
    }
    console.error(error);
    return Response.json(
      { error: { code: "PAIR_FAILED", message: "Pemasangan gagal. Coba lagi." } },
      { status: 500 },
    );
  }
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
