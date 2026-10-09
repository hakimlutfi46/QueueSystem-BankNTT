import { describe, expect, it } from "vitest";
import * as stateRoute from "@/app/api/queue/state/route";
import * as streamRoute from "@/app/api/stream/route";
import { publish } from "@/lib/realtime/hub";
import { createQueueStateController, type QueueStateConnection } from "@/lib/realtime/state-client";
import { createQueueEventStream, formatQueueEvent } from "@/lib/realtime/stream";
import { HEARTBEAT_MS, parseQueueEvent, POLL_INTERVAL_MS, type QueueState } from "@/lib/realtime/types";

const sampleState: QueueState = {
  services: [],
  counters: [],
  lastCall: null,
  settings: {
    branchName: "Bank NTT",
    runningText: "",
    voiceEnabled: true,
    maxRecall: 3,
    targetServiceMinutes: 10,
    ticketFooter: "",
    ticketWidthMm: 80,
  },
  asOf: "2026-10-08T00:00:00.000Z",
};

describe("queue events", () => {
  it("reads a notify payload and ignores anything that is not an event", () => {
    expect(
      parseQueueEvent(
        JSON.stringify({
          id: "4",
          type: "TICKET_CALLED",
          ticketId: "9",
          counterId: 2,
          serviceId: 1,
        }),
      ),
    ).toEqual({
      id: "4",
      type: "TICKET_CALLED",
      ticketId: "9",
      counterId: 2,
      serviceId: 1,
      ticketNumber: null,
      counterName: null,
      displayNumber: null,
    });
    expect(parseQueueEvent("not-json")).toBeNull();
    expect(parseQueueEvent(JSON.stringify({ ticketId: "1" }))).toBeNull();
  });

  it("frames an SSE message the browser can tell apart from the heartbeat", () => {
    expect(formatQueueEvent({ id: "4", type: "TICKET_ISSUED", ticketId: "9", counterId: null, serviceId: 1 }))
      .toBe(
        'id: 4\nevent: queue\ndata: {"id":"4","type":"TICKET_ISSUED","ticketId":"9","counterId":null,"serviceId":1}\n\n',
      );
    expect(HEARTBEAT_MS).toBe(25_000);
    expect(POLL_INTERVAL_MS).toBe(5_000);
    expect(streamRoute.runtime).toBe("nodejs");
    expect(streamRoute.dynamic).toBe("force-dynamic");
    expect(stateRoute.runtime).toBe("nodejs");
    expect(stateRoute.dynamic).toBe("force-dynamic");
  });

  it("sends a first line at once so the browser sees the connection open", async () => {
    const stream = createQueueEventStream({ heartbeatMs: 60_000 });
    const reader = stream.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("retry: 3000\n\n");
    await reader.cancel();
  });

  it("writes a heartbeat and a published event to the stream", async () => {
    const stream = createQueueEventStream({ heartbeatMs: 20 });
    const reader = stream.getReader();
    try {
      publish({
        id: "8",
        type: "TICKET_DONE",
        ticketId: "3",
        counterId: 1,
        serviceId: 1,
      });
      const text = await readUntil(reader, (value) => value.includes("TICKET_DONE") && value.includes(": heartbeat"));
      expect(text).toContain("event: queue");
      expect(text).toContain(": heartbeat");
    } finally {
      await reader.cancel();
    }
  });
});

describe("useQueueState recovery", () => {
  it("reloads on each event, polls after the stream drops, and stops polling when it returns", async () => {
    const states = [sampleState, { ...sampleState, asOf: "2026-10-08T00:00:01.000Z" }];
    let fetches = 0;
    const timers: Array<{ fn: () => void; cancelled: boolean }> = [];
    const handlers: { current: QueueStateConnection | null } = { current: null };

    const controller = createQueueStateController({
      fetchState: async () => {
        fetches += 1;
        return states[Math.min(fetches, states.length) - 1] ?? sampleState;
      },
      connect: (next) => {
        handlers.current = next;
        return { close() {} };
      },
      pollIntervalMs: 5_000,
      scheduleInterval: (fn) => {
        const timer = { fn, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    });

    controller.start();
    await flush();
    expect(fetches).toBe(1);
    expect(controller.getSnapshot().state?.asOf).toBe(sampleState.asOf);

    handlers.current?.onEvent();
    await flush();
    expect(fetches).toBe(2);

    handlers.current?.onDisconnect();
    await flush();
    expect(controller.getSnapshot().connected).toBe(false);
    expect(fetches).toBe(3);
    expect(timers).toHaveLength(1);

    timers[0]?.fn();
    await flush();
    expect(fetches).toBe(4);

    handlers.current?.onOpen();
    expect(controller.getSnapshot().connected).toBe(true);
    expect(timers[0]?.cancelled).toBe(true);
    expect(fetches).toBe(4);

    handlers.current?.onDisconnect();
    await flush();
    expect(fetches).toBe(5);
    controller.stop();
  });
});

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ready: (value: string) => boolean,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
    if (ready(text)) return text;
  }
  throw new Error(`Timed out reading the stream: ${text}`);
}
