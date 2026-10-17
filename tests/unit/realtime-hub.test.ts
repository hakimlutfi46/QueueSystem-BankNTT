import { describe, expect, it, vi } from "vitest";
import type { QueueEvent } from "@/lib/realtime/types";

const event: QueueEvent = { id: "1", type: "TICKET_ISSUED", ticketId: "9", counterId: null, serviceId: 1 };

describe("realtime hub across module reloads", () => {
  it("delivers events between a reloaded copy of the hub and the original one", async () => {
    // Salinan pertama, seperti modul yang dipakai pendengar LISTEN saat server baru menyala.
    const first = await import("@/lib/realtime/hub");
    // Salinan kedua, seperti setelah HMR di `npm run dev`: layar yang tersambung ulang berlangganan di sini.
    vi.resetModules();
    const second = await import("@/lib/realtime/hub");
    expect(second).not.toBe(first);

    const received: QueueEvent[] = [];
    const unsubscribe = second.subscribe((value) => received.push(value));
    try {
      first.publish(event);
      expect(received).toEqual([event]);
    } finally {
      unsubscribe();
    }
    first.publish(event);
    expect(received).toHaveLength(1);
  });
});
