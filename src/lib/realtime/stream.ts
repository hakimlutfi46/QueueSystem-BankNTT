import { subscribe } from "@/lib/realtime/hub";
import { HEARTBEAT_MS, type QueueEvent } from "@/lib/realtime/types";

const encoder = new TextEncoder();

export function formatQueueEvent(event: QueueEvent): string {
  const id = event.id ? `id: ${event.id}\n` : "";
  return `${id}event: queue\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createQueueEventStream(options?: {
  heartbeatMs?: number;
  signal?: AbortSignal;
}): ReadableStream<Uint8Array> {
  const heartbeatMs = options?.heartbeatMs ?? HEARTBEAT_MS;
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (cleaned) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Kirim satu baris segera. Tanpa byte pertama, header respons tertahan sampai heartbeat 25 detik
      // kemudian, dan browser menganggap koneksi belum terbuka. "retry" juga mempercepat sambung ulang.
      send("retry: 3000\n\n");

      unsubscribe = subscribe((event) => {
        send(formatQueueEvent(event));
      });
      heartbeat = setInterval(() => {
        send(": heartbeat\n\n");
      }, heartbeatMs);

      options?.signal?.addEventListener(
        "abort",
        () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // The consumer already closed the stream.
          }
        },
        { once: true },
      );
    },
    cancel() {
      cleanup();
    },
  });
}
