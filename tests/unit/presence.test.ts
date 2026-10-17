import { afterEach, describe, expect, it, vi } from "vitest";
import { keepDevicePresence } from "@/lib/realtime/presence";

afterEach(() => {
  vi.useRealTimers();
});

describe("device presence on an open stream", () => {
  it("re-checks the token while the stream stays open, so a quiet TV keeps showing as connected", async () => {
    vi.useFakeTimers();
    const verify = vi.fn(async () => true);
    const closed = new AbortController();
    keepDevicePresence({
      credentials: [{ kind: "display", token: "tv" }],
      verify,
      onRevoked: () => closed.abort(),
      signal: closed.signal,
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(verify).toHaveBeenCalledTimes(3);
    expect(verify).toHaveBeenCalledWith("display", "tv");

    closed.abort();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(verify).toHaveBeenCalledTimes(3);
  });

  it("closes the stream once the device is revoked, and keeps it through a brief database error", async () => {
    vi.useFakeTimers();
    const answers: Array<boolean | Error> = [new Error("db down"), true, false];
    const verify = vi.fn(async () => {
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next ?? false;
    });
    const onRevoked = vi.fn();
    keepDevicePresence({
      credentials: [{ kind: "kiosk", token: "k" }],
      verify,
      onRevoked,
      signal: new AbortController().signal,
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onRevoked).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onRevoked).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(verify).toHaveBeenCalledTimes(3);
  });

  it("does nothing for signed-in users, who have no device token", async () => {
    vi.useFakeTimers();
    const verify = vi.fn(async () => true);
    keepDevicePresence({ credentials: [], verify, onRevoked: () => {}, signal: new AbortController().signal, intervalMs: 1_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(verify).not.toHaveBeenCalled();
  });
});
