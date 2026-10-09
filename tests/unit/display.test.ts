import { describe, expect, it } from "vitest";
import { COUNTERS_PER_PAGE, heroNumberSize, paginate, stageFit } from "@/lib/display/layout";

describe("TV layout", () => {
  it("shows up to twelve counters per page, six on each side", () => {
    expect(paginate([], COUNTERS_PER_PAGE)).toEqual([[]]);
    expect(paginate(Array.from({ length: 9 }, (_, i) => i), COUNTERS_PER_PAGE)).toHaveLength(1);
    expect(paginate(Array.from({ length: 14 }, (_, i) => i), COUNTERS_PER_PAGE).map((page) => page.length)).toEqual([12, 2]);
  });

  it("scales the 1920×1080 stage to fit any screen without cropping", () => {
    expect(stageFit(1920, 1080)).toEqual({ scale: 1, left: 0, top: 0 });
    const laptop = stageFit(1440, 900);
    expect(laptop.scale).toBeCloseTo(0.75);
    expect(laptop.left).toBe(0);
    expect(laptop.top).toBeCloseTo(45);
    expect(stageFit(3840, 2160).scale).toBe(2);
  });

  it("shrinks long ticket numbers", () => {
    expect(heroNumberSize("A012")).toBeGreaterThan(heroNumberSize("AB123"));
  });
});
