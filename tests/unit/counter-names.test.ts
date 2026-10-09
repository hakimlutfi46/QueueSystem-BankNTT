import { describe, expect, it } from "vitest";
import {
  counterBaseName,
  nextCounterNumber,
  planCounters,
  splitCounterName,
} from "@/lib/admin/counter-names";

const counters = [
  { name: "CS 1", displayNumber: 1, isActive: true },
  { name: "CS 2", displayNumber: 2, isActive: true },
  { name: "Teller 1", displayNumber: 1, isActive: true },
  { name: "Teller 4", displayNumber: 4, isActive: false },
];

describe("counter names", () => {
  it("shortens multi-word services to an acronym", () => {
    expect(counterBaseName("Customer Service")).toBe("CS");
    expect(counterBaseName("Teller")).toBe("Teller");
    expect(counterBaseName("  ")).toBe("Loket");
  });

  it("splits the trailing number from a counter name", () => {
    expect(splitCounterName("Teller 12")).toEqual({ base: "Teller", number: 12 });
    expect(splitCounterName("CS Khusus")).toBeNull();
  });

  it("continues after the highest number, including inactive counters", () => {
    expect(nextCounterNumber(counters, "cs")).toBe(3);
    expect(nextCounterNumber(counters, "Teller")).toBe(5);
    expect(nextCounterNumber(counters, "Kredit")).toBe(1);
  });

  it("plans a batch and flags names already used by an active counter", () => {
    expect(planCounters(counters, "CS", 2, 3)).toEqual([
      { name: "CS 2", displayNumber: 2, taken: true },
      { name: "CS 3", displayNumber: 3, taken: false },
      { name: "CS 4", displayNumber: 4, taken: false },
    ]);
    expect(planCounters(counters, "Teller", 4, 1)[0]?.taken).toBe(false);
    expect(planCounters(counters, "X", 1, 99)).toHaveLength(20);
  });
});
