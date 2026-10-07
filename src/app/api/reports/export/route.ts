import { adminErrorResponse } from "@/lib/admin/errors";
import { guardAdmin, isGuard } from "@/app/api/admin/guard";
import { getPrisma } from "@/lib/db";
import { exportReport } from "@/lib/reports/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const access = await guardAdmin();
  if (isGuard(access)) return access;
  try {
    const file = await exportReport(getPrisma(), new URL(request.url).searchParams);
    return new Response(new Uint8Array(file.body), {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.filename}"`,
      },
    });
  } catch (error) {
    const known = adminErrorResponse(error);
    if (known) return known;
    console.error(error);
    return Response.json(
      { error: { code: "REPORT_FAILED", message: "Laporan gagal dibuat." } },
      { status: 500 },
    );
  }
}
