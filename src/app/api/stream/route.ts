import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/session";
import { decideDevice, DISPLAY_COOKIE, KIOSK_COOKIE } from "@/lib/auth/device";
import { getPrisma } from "@/lib/db";
import { ensureDayClosed } from "@/lib/queue/day-close";
import { ensureQueueListener } from "@/lib/realtime/listen";
import { createQueueEventStream } from "@/lib/realtime/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const jar = await cookies();
  const user = await currentUser();
  const decision = decideDevice({
    pathname: "/api/stream",
    token: new URL(request.url).searchParams.get("token"),
    kioskCookie: jar.get(KIOSK_COOKIE)?.value,
    displayCookie: jar.get(DISPLAY_COOKIE)?.value,
    hasSession: user != null,
  });
  if (decision.type !== "allow") {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Perangkat belum diizinkan." } },
      { status: 401 },
    );
  }

  ensureQueueListener();
  await ensureDayClosed(getPrisma()).catch((error: unknown) => {
    console.error(error);
  });
  const stream = createQueueEventStream({ signal: request.signal });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
