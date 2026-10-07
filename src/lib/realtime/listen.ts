import { Client } from "pg";
import { publish } from "@/lib/realtime/hub";
import { parseQueueEvent, QUEUE_CHANNEL, type QueueEvent } from "@/lib/realtime/types";

export type ListenerStatus = "connecting" | "listening" | "disconnected";

const globalForRealtime = globalThis as typeof globalThis & {
  queueListener?: QueueListener;
};

export class QueueListener {
  private stopped = false;
  private active: Client | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private status: ListenerStatus = "disconnected";
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly options: {
      connectionString: string;
      onEvent: (event: QueueEvent) => void;
      reconnectDelayMs?: number;
      onStatus?: (status: ListenerStatus) => void;
    },
  ) {}

  start(): Promise<void> {
    void this.connect();
    if (this.status === "listening") return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearReconnect();
    const client = this.active;
    this.active = null;
    if (!client) return;
    client.removeAllListeners();
    await client.end().catch(() => undefined);
  }

  private setStatus(status: ListenerStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
    if (status !== "listening") return;
    const pending = this.waiters.splice(0);
    for (const resolve of pending) resolve();
  }

  private clearReconnect(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private scheduleReconnect(failed: Client): void {
    if (this.stopped || this.active !== failed) return;
    this.active = null;
    failed.removeAllListeners();
    void failed.end().catch(() => undefined);
    this.setStatus("disconnected");
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, this.options.reconnectDelayMs ?? 1_000);
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.active) return;
    this.clearReconnect();
    this.setStatus("connecting");
    const client = new Client({
      connectionString: this.options.connectionString,
      application_name: "queue_listen",
    });
    this.active = client;
    client.on("notification", (message) => {
      if (message.channel !== QUEUE_CHANNEL) return;
      const event = parseQueueEvent(message.payload);
      if (event) this.options.onEvent(event);
    });
    client.on("error", () => {
      this.scheduleReconnect(client);
    });
    client.on("end", () => {
      this.scheduleReconnect(client);
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${QUEUE_CHANNEL}`);
      if (this.stopped || this.active !== client) {
        client.removeAllListeners();
        await client.end().catch(() => undefined);
        return;
      }
      this.setStatus("listening");
    } catch {
      this.scheduleReconnect(client);
    }
  }
}

export function ensureQueueListener(): void {
  if (globalForRealtime.queueListener) return;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const listener = new QueueListener({
    connectionString,
    onEvent: publish,
  });
  globalForRealtime.queueListener = listener;
  void listener.start();
}
