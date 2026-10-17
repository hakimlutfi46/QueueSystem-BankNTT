import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/session";
import { decideDevice, DISPLAY_COOKIE, KIOSK_COOKIE } from "@/lib/auth/device";
import { deviceMatcher } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";
import { ensureDayClosed } from "@/lib/queue/day-close";
import { ensureQueueListener } from "@/lib/realtime/listen";
import { keepDevicePresence, type DeviceCredential } from "@/lib/realtime/presence";
import { createQueueEventStream } from "@/lib/realtime/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const jar = await cookies();
  const user = await currentUser();
  const decision = await decideDevice({
    pathname: "/api/stream",
    token: new URL(request.url).searchParams.get("token"),
    kioskCookie: jar.get(KIOSK_COOKIE)?.value,
    displayCookie: jar.get(DISPLAY_COOKIE)?.value,
    hasSession: user != null,
  }, deviceMatcher(getPrisma()));
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
  // Tanpa sesi login berarti kiosk atau TV: jaga catatan terakhir aktifnya selama sambungan terbuka,
  // dan putus sambungan bila perangkat dicabut.
  const closed = new AbortController();
  request.signal.addEventListener("abort", () => closed.abort(), { once: true });
  if (!user) {
    const credentials: DeviceCredential[] = [];
    const kiosk = jar.get(KIOSK_COOKIE)?.value;
    const display = jar.get(DISPLAY_COOKIE)?.value;
    if (kiosk) credentials.push({ kind: "kiosk", token: kiosk });
    if (display) credentials.push({ kind: "display", token: display });
    keepDevicePresence({
      credentials,
      verify: deviceMatcher(getPrisma()),
      onRevoked: () => closed.abort(),
      signal: closed.signal,
    });
  }
  const stream = createQueueEventStream({ signal: closed.signal });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
