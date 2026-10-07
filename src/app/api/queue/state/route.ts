import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { ensureDayClosed } from "@/lib/queue/day-close";
import { loadQueueState } from "@/lib/realtime/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await ensureDayClosed(getPrisma());
    return NextResponse.json(await loadQueueState());
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: { code: "STATE_UNAVAILABLE", message: "Antrian gagal dimuat." } },
      { status: 500 },
    );
  }
}
