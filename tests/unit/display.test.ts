import { describe, expect, it } from "vitest";
import { COUNTERS_PER_PAGE, counterColumns, heroNumberSize, paginate, stageFit } from "@/lib/display/layout";

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

describe("TV counter columns", () => {
  const counter = (name: string, serviceIds: number[]) => ({ name, serviceIds });
  const names = (list: { name: string }[]) => list.map((item) => item.name);
  const cs = (count: number) => Array.from({ length: count }, (_, index) => counter(`CS ${index + 1}`, [1]));
  const teller = (count: number) => Array.from({ length: count }, (_, index) => counter(`Teller ${index + 1}`, [2]));

  it("puts Customer Service on the left and Teller on the right, Teller 1 at the top", () => {
    const [page] = counterColumns([...cs(3), ...teller(3)]);
    expect(names(page!.left)).toEqual(["CS 1", "CS 2", "CS 3"]);
    expect(names(page!.right)).toEqual(["Teller 1", "Teller 2", "Teller 3"]);
    expect(page!.rows).toBe(4);
  });

  it("keeps groups whole when they are uneven but still fit one page", () => {
    const pages = counterColumns([...cs(2), ...teller(5)]);
    expect(pages).toHaveLength(1);
    expect(names(pages[0]!.left)).toEqual(["CS 1", "CS 2"]);
    expect(names(pages[0]!.right)).toEqual(["Teller 1", "Teller 2", "Teller 3", "Teller 4", "Teller 5"]);
    expect(pages[0]!.rows).toBe(5);
  });

  it("pages each column side by side for the 5 + 5 branch and larger ones", () => {
    expect(counterColumns([...cs(5), ...teller(5)])).toEqual([
      { left: cs(5), right: teller(5), rows: 5 },
    ]);
    const pages = counterColumns([...cs(8), ...teller(8)]);
    expect(pages).toHaveLength(2);
    expect(names(pages[1]!.left)).toEqual(["CS 7", "CS 8"]);
    expect(names(pages[1]!.right)).toEqual(["Teller 7", "Teller 8"]);
  });

  it("splits evenly when there is one group or the groups are too uneven for the pages", () => {
    const single = counterColumns(cs(5));
    expect(names(single[0]!.left)).toEqual(["CS 1", "CS 2", "CS 3"]);
    expect(names(single[0]!.right)).toEqual(["CS 4", "CS 5"]);

    const uneven = counterColumns([...cs(1), ...teller(9)]);
    expect(uneven).toHaveLength(1);
    expect(uneven[0]!.left).toHaveLength(5);
    expect(uneven[0]!.right).toHaveLength(5);
  });

  it("shows an empty page when there are no counters", () => {
    expect(counterColumns([])).toEqual([{ left: [], right: [], rows: 4 }]);
  });
});
