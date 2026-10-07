import { NextResponse } from "next/server";
import { loadQueueState } from "@/lib/realtime/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadQueueState());
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: { code: "STATE_UNAVAILABLE", message: "Could not load the queue." } },
      { status: 500 },
    );
  }
}
