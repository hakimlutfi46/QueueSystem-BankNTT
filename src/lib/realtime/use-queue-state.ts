"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createQueueStateController, type QueueSnapshot } from "@/lib/realtime/state-client";
import type { QueueState } from "@/lib/realtime/types";

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
  source.addEventListener("queue", () => handlers.onEvent());
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
