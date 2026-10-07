import { describe, expect, it } from "vitest";
import { QueueError } from "@/lib/queue/errors";
import { assertLegalTransition, illegalTransitions } from "@/lib/queue/transitions";

describe("ticket transitions", () => {
  it("allows only the queue transitions", () => {
    expect(() => assertLegalTransition("WAITING", "SERVING")).not.toThrow();
    expect(() => assertLegalTransition("SERVING", "DONE")).not.toThrow();
    expect(() => assertLegalTransition("SERVING", "NO_SHOW")).not.toThrow();
    expect(() => assertLegalTransition("WAITING", "EXPIRED")).not.toThrow();
  });

  it("rejects every other status change", () => {
    const rejected = illegalTransitions();
    expect(rejected).toHaveLength(21);
    for (const [from, to] of rejected) {
      expect(() => assertLegalTransition(from, to)).toThrow(QueueError);
      try {
        assertLegalTransition(from, to);
      } catch (error) {
        expect(error).toMatchObject({ code: "INVALID_TRANSITION" });
      }
    }
  });
});
