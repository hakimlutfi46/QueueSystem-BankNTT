import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await getPrisma().$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true });
}
