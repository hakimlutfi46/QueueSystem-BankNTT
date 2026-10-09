import { describe, expect, it } from "vitest";
import { kioskGrid, MIN_BUTTON_HEIGHT } from "@/lib/kiosk/layout";

describe("kioskGrid", () => {
  it("keeps one or two services large", () => {
    expect(kioskGrid(1, 1200, 700, 24)).toEqual({ columns: 1, rows: 1, scroll: false });
    expect(kioskGrid(2, 1200, 700, 24).columns).toBeLessThanOrEqual(2);
  });

  it("fits eight bank services on a 19-inch kiosk and a laptop without scrolling", () => {
    for (const [width, height] of [[1200, 760], [1360, 640], [700, 780]]) {
      const grid = kioskGrid(8, width, height, 20);
      expect(grid.scroll).toBe(false);
      expect(grid.columns * grid.rows).toBeGreaterThanOrEqual(8);
      const cellHeight = (height - 20 * (grid.rows - 1)) / grid.rows;
      expect(cellHeight).toBeGreaterThanOrEqual(MIN_BUTTON_HEIGHT);
    }
  });

  it("uses more columns on wide screens", () => {
    expect(kioskGrid(8, 1800, 600, 20).columns).toBeGreaterThan(kioskGrid(8, 700, 900, 20).columns);
  });

  it("scrolls instead of shrinking buttons below a finger's size", () => {
    expect(kioskGrid(30, 1000, 500, 20).scroll).toBe(true);
  });
});
