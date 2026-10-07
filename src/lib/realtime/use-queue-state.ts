"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createQueueStateController, type QueueSnapshot } from "@/lib/realtime/state-client";
import { parseQueueEvent, type QueueEvent, type QueueState } from "@/lib/realtime/types";

const globalForEvents = globalThis as typeof globalThis & {
  queueEventListeners?: Set<(event: QueueEvent) => void>;
};
const queueEventListeners = globalForEvents.queueEventListeners ?? new Set<(event: QueueEvent) => void>();
globalForEvents.queueEventListeners = queueEventListeners;

export function subscribeQueueEvents(listener: (event: QueueEvent) => void): () => void {
  queueEventListeners.add(listener);
  return () => {
    queueEventListeners.delete(listener);
  };
}

async function fetchQueueState(): Promise<QueueState> {
  const response = await fetch("/api/queue/state", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load the queue.");
  }
  return (await response.json()) as QueueState;
}

function connectToStream(handlers: {
  onEvent: () => void;
  onOpen: () => void;
  onDisconnect: () => void;
}): { close: () => void } {
  const source = new EventSource("/api/stream");
  source.addEventListener("open", () => handlers.onOpen());
  source.addEventListener("error", () => handlers.onDisconnect());
  source.addEventListener("queue", (message) => {
    handlers.onEvent();
    const data = "data" in message ? message.data : null;
    if (typeof data !== "string") return;
    const event = parseQueueEvent(data);
    if (!event) return;
    for (const listener of queueEventListeners) listener(event);
  });
  return {
    close() {
      source.close();
    },
  };
}

export function useQueueState(): QueueSnapshot {
  const [controller] = useState(() =>
    createQueueStateController({
      fetchState: fetchQueueState,
      connect: connectToStream,
    }),
  );

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );

  useEffect(() => {
    controller.start();
    return () => {
      controller.stop();
    };
  }, [controller]);

  return snapshot;
}
