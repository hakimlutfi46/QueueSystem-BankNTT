import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { guardAdmin, isGuard } from "@/app/api/admin/guard";
import { findKioskInstaller } from "@/lib/kiosk/installer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unduh installer aplikasi kiosk Windows (.exe). Hanya admin; dibuat dengan `npm run kiosk:build` atau dari Admin. */
export async function GET(): Promise<Response> {
  const access = await guardAdmin();
  if (isGuard(access)) return access;
  const installer = await findKioskInstaller();
  if (!installer) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Installer belum dibuat. Tekan Build installer di Admin → Perangkat." } },
      { status: 404 },
    );
  }
  const stream = Readable.toWeb(createReadStream(installer.path)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/vnd.microsoft.portable-executable",
      "Content-Length": String(installer.size),
      "Content-Disposition": `attachment; filename="${installer.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
