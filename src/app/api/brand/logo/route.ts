import { readLogo, DEFAULT_BRANDING } from "@/lib/branding";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logo lembaga untuk semua layar, termasuk kiosk dan TV yang tidak login. Alamatnya memuat ?v=<sidik>,
 * jadi browser boleh menyimpannya lama dan otomatis mengambil yang baru saat logo diganti.
 */
export async function GET(request: Request): Promise<Response> {
  const logo = await readLogo(getPrisma()).catch(() => null);
  if (!logo) return Response.redirect(new URL(DEFAULT_BRANDING.defaultLogo, request.url), 302);
  const requested = new URL(request.url).searchParams.get("v");
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.mime,
      "Cache-Control": requested === logo.version ? "public, max-age=31536000, immutable" : "no-cache",
      ETag: `"${logo.version}"`,
      "X-Content-Type-Options": "nosniff",
      // SVG unggahan tidak boleh menjalankan skrip bila dibuka langsung.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
