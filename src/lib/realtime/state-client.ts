import { POLL_INTERVAL_MS, type QueueState } from "@/lib/realtime/types";

export type QueueSnapshot = {
  state: QueueState | null;
  connected: boolean;
  error: string | null;
};

export type QueueStateConnection = {
  onEvent: () => void;
  onOpen: () => void;
  onDisconnect: () => void;
};

const INITIAL_SNAPSHOT: QueueSnapshot = {
  state: null,
  connected: false,
  error: null,
};

export function createQueueStateController(options: {
  fetchState: () => Promise<QueueState>;
  connect: (handlers: QueueStateConnection) => { close: () => void };
  pollIntervalMs?: number;
  scheduleInterval?: (callback: () => void, delayMs: number) => () => void;
}): {
  start: () => void;
  stop: () => void;
  getSnapshot: () => QueueSnapshot;
  getServerSnapshot: () => QueueSnapshot;
  subscribe: (listener: () => void) => () => void;
} {
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const scheduleInterval =
    options.scheduleInterval ??
    ((callback, delayMs) => {
      const timer = setInterval(callback, delayMs);
      return () => clearInterval(timer);
    });

  let snapshot = INITIAL_SNAPSHOT;
  let generation = 0;
  let started = false;
  let connection: { close: () => void } | null = null;
  let stopPolling = () => {};
  let polling = false;
  const listeners = new Set<() => void>();

  function emit(next: QueueSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  async function refresh() {
    const token = ++generation;
    try {
      const state = await options.fetchState();
      if (token !== generation) return;
      emit({ ...snapshot, state, error: null });
    } catch (error) {
      if (token !== generation) return;
      emit({
        ...snapshot,
        error: error instanceof Error ? error.message : "Could not load the queue.",
      });
    }
  }

  function beginPolling() {
    if (polling) return;
    polling = true;
    void refresh();
    stopPolling = scheduleInterval(() => {
      void refresh();
    }, pollIntervalMs);
  }

  function endPolling() {
    if (!polling) return;
    polling = false;
    stopPolling();
    stopPolling = () => {};
  }

  return {
    start() {
      if (started) return;
      started = true;
      void refresh();
      connection = options.connect({
        onOpen: () => {
          endPolling();
          emit({ ...snapshot, connected: true, error: null });
        },
        onEvent: () => {
          void refresh();
        },
        onDisconnect: () => {
          emit({ ...snapshot, connected: false });
          beginPolling();
        },
      });
    },
    stop() {
      started = false;
      generation += 1;
      endPolling();
      connection?.close();
      connection = null;
    },
    getSnapshot() {
      return snapshot;
    },
    getServerSnapshot() {
      return INITIAL_SNAPSHOT;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
