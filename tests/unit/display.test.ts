import { describe, expect, it } from "vitest";
import { counterPages } from "@/lib/display/layout";

describe("counter pages", () => {
  it("uses one column up to four counters and pages after eight", () => {
    expect(counterPages([1, 2, 3, 4])).toEqual({ columns: 1, pages: [[1, 2, 3, 4]] });
    expect(counterPages([1, 2, 3, 4, 5]).columns).toBe(2);
    expect(counterPages([1, 2, 3, 4, 5]).pages).toHaveLength(1);
    const paged = counterPages([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paged).toEqual({
      columns: 2,
      pages: [
        [1, 2, 3, 4, 5, 6, 7, 8],
        [9],
      ],
    });
  });
});
