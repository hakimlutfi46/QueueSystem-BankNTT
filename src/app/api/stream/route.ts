import { ensureQueueListener } from "@/lib/realtime/listen";
import { createQueueEventStream } from "@/lib/realtime/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  ensureQueueListener();
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
