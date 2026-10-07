import { describe, expect, it } from "vitest";
import { mergeCounterDesk } from "@/lib/counters/merge";
import type { CounterDesk } from "@/lib/counters/types";
import { formatDuration } from "@/lib/format-duration";
import type { QueueState } from "@/lib/realtime/types";

describe("formatDuration", () => {
  it("uses minutes and seconds, then hours past one hour", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

describe("mergeCounterDesk", () => {
  const desk: CounterDesk = {
    mode: "desk",
    branchName: "Bank NTT",
    targetServiceMinutes: 10,
    counter: { id: 1, name: "CS 1", displayNumber: 1, status: "OPEN", serviceNames: ["Customer Service"] },
    activeTicket: null,
    waitingCount: 0,
    recent: [],
  };

  it("enables the waiting count when a ticket arrives", () => {
    const live = state({
      asOf: "2026-10-08T02:00:00.000Z",
      waitingCount: 1,
      officerId: 7,
      active: null,
    });
    const merged = mergeCounterDesk(desk, live, 7, null);
    expect(merged.mode).toBe("desk");
    if (merged.mode !== "desk") return;
    expect(merged.waitingCount).toBe(1);
    expect(merged.activeTicket).toBeNull();
  });

  it("keeps the desk snapshot until a newer live state arrives", () => {
    const paused = { ...desk, counter: { ...desk.counter, status: "PAUSED" as const } };
    const live = state({
      asOf: "same",
      waitingCount: 0,
      officerId: 7,
      active: null,
      status: "OPEN",
    });
    const merged = mergeCounterDesk(paused, live, 7, "same");
    expect(merged).toBe(paused);
  });
});

function state(input: {
  asOf: string;
  waitingCount: number;
  officerId: number | null;
  active: null;
  status?: "OPEN" | "PAUSED" | "CLOSED";
}): QueueState {
  return {
    services: [{ id: 1, name: "Customer Service", prefix: "A", waitingCount: input.waitingCount }],
    counters: [
      {
        id: 1,
        name: "CS 1",
        displayNumber: 1,
        status: input.status ?? "OPEN",
        officerId: input.officerId,
        officerName: "Petugas",
        serviceIds: [1],
        activeTicket: null,
      },
    ],
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
    asOf: input.asOf,
  };
}
